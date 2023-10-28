// Run `npm run dev` in your terminal to start a development server
// Open a browser tab at http://localhost:8787/ to see your worker in action
// Run `npm run deploy` to publish your worker
// Learn more at https://developers.cloudflare.com/workers/

import { Router } from "itty-router";
import {
  CHANNEL_ID,
  ESP32_PASS,
  ESP32_USER,
  PUBLIC_KEY,
  USER_ID,
} from "./secrets";
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
  //
  // Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
  // MY_QUEUE: Queue;
}

const router = Router<Request>();

router.post("/discord", async (request) => {
  const { isValid, interaction } = await verifyDiscordRequest(request);
  if (!isValid) return new Response("Bad Request Signature", { status: 401 });

  // see: https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object

  if (interaction.type === InteractionType.PING) {
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    switch (interaction.data.name.toLowerCase()) {
      case "wake": {
        // console.log(interaction);
        const channel = interaction.channel_id;
        const user = interaction.member.user.id;

        if (channel !== CHANNEL_ID) {
          return new JsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "You can't use this command in this channel.",
            },
          });
        }

        if (user !== USER_ID) {
          return new JsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "You can't use this command.",
            },
          });
        }

        return new JsonResponse({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Processing...",
          },
        });
      }
    }
  }
  return new JsonResponse({ error: "Unknown Type" }, 400);
});

router.get(
  "/poll",
  withBasicAuth(async (request) => {
    return new Response("OK", { status: 200 });
  })
);

router.all("*", () => new Response("Not Found", { status: 404 }));

export default {
  async fetch(request: Request): Promise<Response> {
    return router.handle(request);
  },
};

async function verifyDiscordRequest(request: Request) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();
  const isValidRequest =
    signature && timestamp && verifyKey(body, signature, timestamp, PUBLIC_KEY);
  if (!isValidRequest) return { isValid: false };
  return { interaction: JSON.parse(body), isValid: true };
}

function withBasicAuth(f: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    // see: https://developers.cloudflare.com/workers/examples/basic-auth/
    const { protocol, pathname } = new URL(request.url);
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const authHeader = request.headers.get("authorization");

    // if (protocol !== "https:" || forwardedProto !== "https") {
    //   return new Response("HTTPS Only", { status: 400 });
    // }

    if (authHeader === null) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="esp32-realm"' },
      });
    }

    const [scheme, encoded] = authHeader.split(" ");
    if (scheme !== "Basic" || !encoded) {
      return new Response("Malformed Authorization Header", { status: 400 });
    }

    // Decodes the base64 value and performs unicode normalization.
    // see https://datatracker.ietf.org/doc/html/rfc7613#section-3.3.2 (and #section-4.2.2)
    // see https://dev.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
    const buffer = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(buffer).normalize();

    const [user, pass] = decoded.split(":", 2);

    if (typeof user !== "string" || typeof pass !== "string") {
      return new Response("Malformed Authorization Header", { status: 400 });
    }

    const validUser = safeEqual(user, ESP32_USER);
    const validPass = safeEqual(pass, ESP32_PASS);

    if (!validUser || !validPass) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="esp32-realm"' },
      });
    }

    return f(request);
  };
}

function safeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);

  // It is safe to reveal the length of the secret because the secret is long and random
  if (aa.byteLength !== bb.byteLength) return false;

  // It is not safe to reveal the contents of the secret
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];

  return diff === 0;
}

class JsonResponse extends Response {
  constructor(body: unknown, status?: number) {
    super(JSON.stringify(body), {
      status: status ?? 200,
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
    });
  }
}
