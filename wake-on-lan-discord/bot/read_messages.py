import json
import requests

from secrets import BOT_TOKEN, CHANNEL_ID

# https://discord.com/developers/docs/resources/channel#get-channel-messages
url = f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages"
headers = {"Authorization": f"Bot {BOT_TOKEN}"}

r = requests.get(url, headers=headers)
print(json.dumps(r.json(), indent=2))
