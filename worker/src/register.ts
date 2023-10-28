import { APP_ID, BOT_TOKEN } from './secrets.js'

const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bot ${BOT_TOKEN}`,
  },
  method: 'PUT',
  body: JSON.stringify([
    {
      name: 'wake',
      type: 1, // CHAT_INPUT
      description: 'Wake a device on the network',
    },
  ]),
})

if (res.ok) {
  console.log('ok.')
} else {
  console.error('Error registering commands')
  console.error(await res.text())
}
