import requests

from secrets import APP_ID, BOT_TOKEN

# https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
url = f"https://discord.com/api/v10/applications/{APP_ID}/commands"
json = {
    "name": "wake",
    "type": 1,  # CHAT_INPUT
    "description": "Wake a device on the network",
}

headers = {"Authorization": f"Bot {BOT_TOKEN}"}

r = requests.post(url, headers=headers, json=json)
