// Run `npm run dev` in your terminal to start a development server
// Open a browser tab at http://localhost:8787/ to see your worker in action
// Run `npm run deploy` to publish your worker
// Learn more at https://developers.cloudflare.com/workers/

import { CHANNEL_ID, PUBLIC_KEY, USER_ID } from './secrets';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';

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


export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') return new Response('Not Found.', { status: 404 });
    const { isValid, interaction } = await verify(request);
    if (!isValid) return new Response('Bad Request Signature', { status: 401 });

    if (interaction.type === InteractionType.PING) {
      return new JsonResponse({
        type: InteractionResponseType.PONG,
      });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      switch (interaction.data.name.toLowerCase()) {
        case 'wake': {
          // console.log(interaction);
          const channel = interaction.channel_id;
          const user = interaction.member.user.id;

          if (channel !== CHANNEL_ID) {
            return new JsonResponse({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'You can\'t use this command in this channel.',
              },
            });
          }

          if (user !== USER_ID) {
            return new JsonResponse({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: 'You can\'t use this command.',
              },
            });
          }

          return new JsonResponse({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Processing...',
            },
          });
        }
      }
    }
    return new JsonResponse({ error: 'Unknown Type' }, 400);
  },
};

async function verify(request: Request) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest = signature && timestamp && verifyKey(body, signature, timestamp, PUBLIC_KEY);
  if (!isValidRequest) return { isValid: false };
  return { interaction: JSON.parse(body), isValid: true };
}


class JsonResponse extends Response {
  constructor(body: unknown, status?: number) {
    super(JSON.stringify(body), {
      status: status ?? 200,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    });
  }
}
