# discord-notify-bot
A super hacky Discord.js bot that will watch a set of channels on a [Discord](https://discordapp.com/) server and notify users if their search terms appear in message contents or embeds.

# Features
* accepts per-user commands in the form of Direct Messages
* stores a per-user list of words to watch for in a linked MongoDB instance
* watches for embeds in a preset list of channels and notifies users when their matches appear

NOTE: **The bot currently ignores messages without any embeds.**

# Prerequisites
* Git
* Docker (preferrably 1.10+ or CE)
* A Discord Server
* Admin privilege on the Discord server (can be temporary)

# Clone the Source
```bash
git clone https://github.com/bodom0015/discord-notify-bot
cd discord-notify-bot/
```

# Configuration
Open up config.js and make sure to set all of the appropriate fields:
* BOT_USER_ID
* ADMIN_USER_ID
* ADMIN_USER_NAME
* DEFAULT_CHANNEL_ID
* WATCHED_CHANNELS
* BOT_TOKEN


This will involve setting up a Bot User and adding it to the server.

For more details on the restrictions placed on Bot Users, see https://twentysix26.github.io/Red-Docs/red_guide_bot_accounts/

## The Easy Part: Generating a new bot token
Visit https://discordapp.com/developers/applications/me to generate a new application token.

Click on "New App", fill in a name/description, choose an icon, and Submit the form.

You should then be able to view the "App" you've just created.

## The Weird Part: Converting Your App to a Bot User
scroll down to turn it into a Bot account. (WARNING: this is irreversible - make sure you make a new app here to avoid accidentally breaking something you need!)

Once you've turned the App into a Bot Account, you should have a section titled "Bot" and a Token field which you cvan "Click to Reveal".

Copy this token into the **BOT_TOKEN** field of your [config.js](config.js) file.

For more information and a better walkthrough, see https://twentysix26.github.io/Red-Docs/red_guide_bot_accounts/

## The Admin Part: Add your Bot to the Discord Server
You will need the "Manage Server" permission on the target server to complete this next part.

Now that you have your Bot User all set up, you should have it's Client ID, Client Secret, and Token.

Plug your bot's Client ID (at the top of the details page) into the following URL and navigate to it in your browser:
`https://discordapp.com/oauth2/authorize?client_id=CLIENTID&scope=bot`

This should bring you to a dialogue allowing you to add the bot to a server.

For more information and a better walkthrough, see https://github.com/jagrosh/MusicBot/wiki/Adding-Your-Bot-To-Your-Server

## The Hardest Part: Discovering User and Channel IDs
Now your bot should be able to join the Discord server, but how do you know the IDs of the channels and users?

One way to find these is from the URL in the browser Discord client - the last part of the URL is the numerical part of the "Snowflake" ID. Sadly, this does not seem to be true for Direct Messages with users.

Another way is to sniff all messages with the bot to determine its ID, the ID of the admin user, and the list of channel IDs to watch.

If all else fails, you can try using the Debugger to sniff Discord messages to get a feel for the formatting (see below: Running the Debugger)

This will likely involve a bit of trial and error, especially if your list of watched channels changes frequently (e.g. new channels added, old channels decommissioned, etc)

# Build
Install [`docker`](https://www.docker.com/get-docker) and run the following command:
```bash
docker build -t discord-notify-bot .
```

# Run
Run a MongoDB container to house the users' lists of watched terms:
```bash
docker run --name=dispatch-mongo -it --restart=Always -p 27017:27017 -v /path/to/some/persisted/volume:/data/db mongo:latest
```

NOTE: For Docker CE, the "always" may need to be lowercase.

Then, run a container from the `discord-notify-bot` image you just built:
```bash
docker run --name=dispatch-notify-bot --restart=Always --link dispatch-mongo:dispatch-mongo -it discord-notify-bot
```

NOTE: For Docker CE, the "always" may need to be lowercase.

## Viewing the Logs
You can view the logs of the running container using the following command:
```bash
docker logs -f dispatch-notify-bot
```
## Running the Debugger
Included is a debugger and a Dockerfile to build it:
```
docker build -t discord-debugger -f Dockerfile.debug .
docker run -it --name=discord-debugger --link=dispatch-mongo discord-debugger
docker logs -f discord-debugger
```

The debugger is just a slimmed down version of the bot that will echo Discord messages and embeds to the console. This can be useful when determining user and channel IDs to populate the rest of your [`config.js`](config.js) file.

# Basic Usage
The @dispatch-notify-bot#3168 can be used to customize the notifications that you receive from the various #dispatch  channels. This bot will accept commands through private messages specifying your *watch list*. Similarly, when a notification comes up matching a word on your *watch list*, the notification from #dispatch will be forwarded to you as a private message.

__**Desktop:**__
Right-click on @dispatch-notify-bot#3168 and choose Message to send the bot a private message.

__**Mobile:**__
Click here: @dispatch-notify-bot#3168  to send the bot a private message.

You can get basic instructions for using the bot by sending it a Private Message saying `help`. 

Things to note:
 1.  This chat bot is only reading the notifications that come through the various #dispatch channels from the other bots.. if cupogomap.com is down, this bot will have no notification to forward to you
 2.  Girafarig comes through blank.. I have no idea why this happens. Check #uncommon for location if/when it does.
 3.  If your *watch list* is empty, the bot will not send you any notifications
 4.  Your *watch list* is cumulative - for example, if you `add dratini -rantoul` it won't tell you about anything in Rantoul, even if it is a Dratini 
 5.  Your *watch list* is not case-sensitive: `add Unown` is the same as `add UNOWN` or `add unown`
 6.  __**VERY IMPORTANT**__:  Don't tell the bot to ignore common words unless you know what you are doing. For example, `add -until` would ignore everything containing the word "until", which appears in every single notification that comes through #dispatch. Be very careful with the words that you choose to ignore in this way.

Example commands that could be sent to the bot as a private message:
 -  `help` will reply with a nicely-formatted message containing basic instructions on how to use the bot
 -  `list` will reply with your current watch list.. if this list is empty, you will not receive any notifications from the bot
 -  `add unown` would notify you directly if it sees an :unown:
 -  `add campus` would notify you directly if it sees any notifications with "Campus" in the text
 -  `rm campus unown` will remove terms that you have previously `add`ed to your watch list
 -  `clear` will remove ALL words from your watch list

# Advanced Features
 -  `add -dratini -urbana` will tell the bot that you don't want to receive any notifications containing the words "Dratini" or "Urbana"
 -  `add lake+of+the+woods` will tell the bot to notify you if it sees "Lake of the Woods"
 -  `add -dodds+park` would tell the bot that you don't want to receive any notifications containing "Dodds Park"
 -  `rm -dodds+park` would undo the previous command - any notifications containing "Dodds Park" that match your filters will once again be forwarded to you

# Expert (Experimental) Features
Expect a lot of trial and error with these lightly-tested features:
* Pseudo Regular Expressions: `add ?wailmer+100+%` (place the `?` operator at the start of your search term to change the behavior of `+` to match any string, instead of just a space)
* GPS Box: `add .40.098145,-88.252202:40.101264,-88.248747` (starting a search term the `.` operator will treat it as a pair of GPS coordinates, notifies you of anything in the box formed by following their latitude/longitude lines - the example is for Hessel Park, but these can be found from the URL in Google Maps after picking a point on the map)

# Modifying the Bot
To make changes to the bot, simply modify `bot.js` and then execute the `reload.sh` script:
```
vi bot.js
./reload.sh
```

This will remove your existing bot (if one is running), rebuild the Docker image, and start up a container running the new code.
