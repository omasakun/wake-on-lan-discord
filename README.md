# Wake on Lan using Discord (ESP32)

外出中にパソコンを遠隔で起動できるようにします。

## 構成

## Sketch0

この開発では ESP32 を使うので、手始めにとりあえず LED をチカチカさせた。

- ESP32 を PC に繋いでもシリアルポートが認識されなかった
  - デバイスマネージャーを開くと、ドライバーが見つからないって言っていた
  - [CP210x USB to UART Bridge Virtual COM Port driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) をインストールしたら解決した。
- 書き込み時に `Failed to connect to ESP32: Wrong boot mode detected (0x13)! The chip needs to be in download mode.`
  - BOOT ボタンを押したままで RST ボタンを一回押して、書き込みが始めるようにしたら書き込めた。
  - [公式ドキュメント](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html#automatic-bootloader) は 1uF-10uF range のキャパシタを入れると安定して動くと言ってた。
  - なので手元の適当なキャパシタを入れてみたら、たしかに安定した。

## Wake on Lan using Discord (ESP32)

外出中にパソコンを遠隔で起動できるようにする。

Discord API の使い方を知らなかったので、とりあえず適当なボットを作ってみる。

- [Getting started](https://discord.com/developers/docs/getting-started)
- [Developer portal](https://discord.com/developers/applications) でアプリケーションを作ると色々な API が使える。
  - Public Bot の設定をオフにすると、自分だけがそのボットを追加できるようにできる。
  - OAuth2 / URL Generator を使ってボットをサーバーに追加するための URL が手に入る。
- [Discord application commends](https://discord.com/developers/docs/interactions/application-commands) を参考に、コマンドを追加する。
- どうやら 3 秒くらいまでにコマンドへ応答しないといけないらしい。でも ESP32 で websocket を使うのは面倒そうなのでどうしようか。
  - ひとまず cloudflare worker に仮の応答をさせておくことにした。
  - [公式のサンプル](https://github.com/discord/cloudflare-sample-app/blob/7ffeed8e4b9e9420ac46dba63e80c2cd3265ecaa/src/server.js) を参考に書く。
- さて、実は ESP32 でも websocket client を簡単に作れるライブラリがあったらしい。

Discord API のドキュメントを読むのに疲れてきたので、ひとまず Cloudflare Worker に面倒な部分をすべて引き受けてもらうことにした。

- Discord Bot としての挙動はすべて Worker で行う
  - Worker は、起動リクエストがあったかどうかを D1 で管理しておく
  - 一定時間経っても ESP32 が応答してくれなかったら、エラーにする
    - Worker には同時起動数制限があるので、いい感じにやる
  - ESP32 が WOL 送信に失敗したときも、エラーにしてやる
  - エンドポイント: `/poll`, `/report`
- ESP32 は Worker を polling して、 WOL パケットを送るべきか確認する
  - 送信に成功 or 失敗したら Worker に報告する
- ボットの `/wake` への返答
  - thinking...
  - `Sure! Your PC will be waked up soon.`
  - `Sorry, ESP32 is offline.`
  - `Sorry, Failed to send WOL packet.`
- 起動したいパソコンの MAC アドレスは、例えば `ipconfig /all` してもわかるし、スマホで [Network Analyzer](https://play.google.com/store/apps/details?id=net.techet.netanalyzerlite.an) を使ったりしてもわかる。
  - うまく Wake on LAN できないので、 Wireshark でパケットを見てみたら、ちゃんとおくれてた。
