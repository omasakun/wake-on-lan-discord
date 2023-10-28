// Run `npm run dev` in your terminal to start a development server
// Open a browser tab at http://localhost:8787/ to see your worker in action
// Run `npm run deploy` to publish your worker
// Learn more at https://developers.cloudflare.com/workers/

// https://discord.com/developers/applications
// https://dash.cloudflare.com/

import { Router } from 'itty-router'
import {
  APP_ID,
  BOT_TOKEN,
  CHANNEL_ID,
  ESP32_PASS,
  ESP32_USER,
  PUBLIC_KEY,
  USER_ID,
} from './secrets'
import { InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions'

export interface Env {
  // see: wrangler.toml
  DB: D1Database
}

const router = Router<Request, [env: Env, ctx: ExecutionContext]>()

router.post('/discord', async (request, env, ctx) => {
  const { isValid, interaction } = await verifyDiscordRequest(request)
  if (!isValid) return new Response('Bad Request Signature', { status: 401 })

  // see: https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object

  if (interaction.type === InteractionType.PING) {
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    })
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    switch (interaction.data.name.toLowerCase()) {
      case 'wake': {
        // console.log(interaction);
        const channel = interaction.channel_id
        const user = interaction.member.user.id

        if (channel !== CHANNEL_ID) {
          return new JsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "You can't use this command in this channel.",
            },
          })
        }

        if (user !== USER_ID) {
          return new JsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "You can't use this command.",
            },
          })
        }

        const id = interaction.id
        const token = interaction.token

        await env.DB.prepare('INSERT INTO interactions (id, token) VALUES (?, ?)')
          .bind(id, token)
          .run()

        console.log({ interaction })

        return new JsonResponse({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        })
      }
    }
  }
  return new JsonResponse({ error: 'Unknown Type' }, 400)
})

router.get(
  '/poll',
  withBasicAuth(async (request, env) => {
    const exists = await env.DB.prepare('SELECT * FROM interactions LIMIT 1').all()

    if (!exists.results) {
      console.log('poll: error', exists)
      return new Response('error', { status: 500 })
    }
    if (exists.results.length === 0) {
      return new Response('noop', { status: 200 })
    } else {
      return new Response('wake', { status: 200 })
    }
  }),
)

router.post(
  '/report',
  withBasicAuth(async (request, env) => {
    const text = await request.text()

    // get all interactions and delete them
    const [interactions, _] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM interactions'),
      env.DB.prepare('DELETE FROM interactions'),
    ])

    if (!interactions.results) {
      console.log('report: error', interactions)
      return new Response('error', { status: 500 })
    }

    // https://discord.com/developers/docs/reference#api-versioning
    // https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
    const res = await Promise.all(
      interactions.results.map(async (interaction: any) =>
        fetch(
          `https://discord.com/api/v10/webhooks/${APP_ID}/${interaction.token}/messages/@original`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bot ${BOT_TOKEN}`,
            },
            body: JSON.stringify({
              content: text,
            }),
          },
        ),
      ),
    )

    const texts = await Promise.all(res.map(async (r) => r.text()))
    console.log({ texts })

    return new Response(`ok (responded to ${interactions.results.length} interactions)`, {
      status: 200,
    })
  }),
)

router.all('*', () => new Response('Not Found', { status: 404 }))

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx)
  },
}

async function verifyDiscordRequest(request: Request) {
  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  const body = await request.text()
  const isValidRequest = signature && timestamp && verifyKey(body, signature, timestamp, PUBLIC_KEY)
  if (!isValidRequest) return { isValid: false }
  return { interaction: JSON.parse(body), isValid: true }
}

function withBasicAuth(
  f: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>,
) {
  return async (request: Request, env: Env, ctx: ExecutionContext) => {
    // see: https://developers.cloudflare.com/workers/examples/basic-auth/
    const { protocol, pathname } = new URL(request.url)
    const forwardedProto = request.headers.get('x-forwarded-proto')
    const authHeader = request.headers.get('authorization')

    if (protocol !== 'https:' || forwardedProto !== 'https') {
      return new Response('HTTPS Only', { status: 400 })
    }

    if (authHeader === null) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="esp32-realm"' },
      })
    }

    const [scheme, encoded] = authHeader.split(' ')
    if (scheme !== 'Basic' || !encoded) {
      return new Response('Malformed Authorization Header', { status: 400 })
    }

    // Decodes the base64 value and performs unicode normalization.
    // see https://datatracker.ietf.org/doc/html/rfc7613#section-3.3.2 (and #section-4.2.2)
    // see https://dev.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
    const buffer = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(buffer).normalize()

    const [user, pass] = decoded.split(':', 2)

    if (typeof user !== 'string' || typeof pass !== 'string') {
      return new Response('Malformed Authorization Header', { status: 400 })
    }

    const validUser = safeEqual(user, ESP32_USER)
    const validPass = safeEqual(pass, ESP32_PASS)

    if (!validUser || !validPass) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="esp32-realm"' },
      })
    }

    return f(request, env, ctx)
  }
}

function safeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)

  // It is safe to reveal the length of the secret because the secret is long and random
  if (aa.byteLength !== bb.byteLength) return false

  // It is not safe to reveal the contents of the secret
  let diff = 0
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i]

  return diff === 0
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class JsonResponse extends Response {
  constructor(body: unknown, status?: number) {
    super(JSON.stringify(body), {
      status: status ?? 200,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    })
  }
}
