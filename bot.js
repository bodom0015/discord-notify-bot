// Discord.js and friends
const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.js');

// Add string scoring
require("string_score");

// Official MongoDB Driver
const MongoClient = require('mongodb').MongoClient
const assert = require('assert');

// Third-party fun
const msgEmbedToRich = require("discordjs-embed-converter").msgEmbedToRich;
const richToMsgEmbed = require("discordjs-embed-converter").richToMsgEmbed;
const beep = require('beepbeep');
const sleep = require('sleep');

// Logging switches
const debug = true;
const verbose = false;

// MongoDB URL
const mongoHost = process.env.MONGO_SERVICE_HOST || 'dispatch-mongo';
const mongoPort = process.env.MONGO_SERVICE_PORT || '27017';
const mongoCollection = process.env.MONGO_COLLECTION || 'dispatch-notify-bot';
const mongoUrl = `mongodb://${mongoHost}:${mongoPort}/${mongoCollection}`;
//let entries = [];
let database = null;
const collectionName = 'matchwords';
const mongoOpts = { 
  autoReconnect: true,
  w: 1,
  keepAlive: 1
};

const onlyUnique = function(value, index, self) { return value && self.indexOf(value) === index; };
const toLower = function(x){ return x.toLowerCase(); };

// Reconnect to the database
(function() {
  debug && console.log(`${database === null ? 'C' : 'Rec'}onnecting to MongoDB at ${mongoUrl}...`);
  return MongoClient.connect(mongoUrl, mongoOpts, function(err, db) {
    assert.equal(null, err);
    console.log(`${database === null ? 'C' : 'Rec'}onnected to MongoDB at ${mongoUrl}`);
    assert.notEqual(null, database = db);
  });
})();

// Workaround... see https://github.com/hydrabolt/discord.js/issues/1685#issuecomment-315620118
client.on('disconnect', function () {
	clearTimeout(client.ws.connection.ratelimit.resetTimer);
});

let shutdown = function() {
  console.log("Stopping Dispatch Notify Bot...");
  client.destroy(function () {
    console.log("Logged out of Discord");
  });
  
  database.close(false, function(err, result) {
    if (err) {
      console.log("Error encountered closing MongoDB connection", err);
    } else {
      console.log("MongoDB connection closed successfully");
    }
  });
  
  console.log("Dispatch Notify Bot has been stopped");
}
process.on( 'SIGTERM', function () {  shutdown();  });
process.on( 'SIGINT', function () {  shutdown();  });
process.on('unhandledRejection', console.error);

// Log startup events
debug && console.log("Starting Dispatch Notify Bot...");
client.on('ready', () => {
  beep(1);
  debug && console.log(`Logged in as ${client.user.tag}!`);
});

let performSend = function(channel, message, additionalContent, attemptNumber) {
  // TODO: how to print embed contents to log
  if (additionalContent) {
    channel.send(additionalContent, message)
      .then(message => {
        debug && console.log(`Sent message to ${channel}`);
        if (!message.content && message.embeds.length === 0) {
          channel.send("Detected a blank message.. probably Girafarig. Please check <#343289795629547531> to confirm.");
        }
       })
      .catch(err => console.log(`Failed to send message to ${channel}: ${err}`));
  } else {
    // message could a string or a RichEmbed
    channel.send(message)
      .then(message => {
        if (!message.content && message.embeds.length === 0) {
          channel.send("Detected a blank message.. probably Girafarig. Please check <#343289795629547531> to confirm.");
        }
      })
      .catch(err => console.log(`Failed to send message to ${channel}: ${err}`));
  }
}

// Send a Direct Message the the user this entry belongs to
let sendDM = function(channel, message, additionalContent, attemptNumber) {
  let MAX_RETRIES = 5;
  
  if (!attemptNumber) {
    attemptNumber = 0;
  }
  
  attemptNumber++;
  
  // if channel is an object, send away!
  if (channel.send) {
    performSend(channel, message, additionalContent, attemptNumber);
    return;
  }
  
  let channels = {};
  // Otherwise, assume it's a user Snowflake and attempt to look them up
  if (channel.indexOf("#")!== -1) {
    debug && console.log(`Searching client.channels for ${channel}...`);
    channels = client.channels;
  } else {
    debug && console.log(`Searching client.users for ${channel}...`);
    channels = client.users
  }
  
  // See https://discordapp.com/developers/docs/reference#message-formatting
  let snowflake = channel.replace(/[<>\!@#]/g, "");
  debug && console.log(`Looking up ${snowflake}...`);
  
  let success = false;
  
  // Retry a few times until successful
  try {
    let c = channels.get(snowflake);
    debug && console.log(`Found channel: ${c}...`);
    performSend(c, message, additionalContent, attemptNumber);
    success = true;
    debug /*&& verbose*/ && console.log(`Successfully notified ${snowflake}`);
  } catch (ex) {
    debug && console.log(`Attempt #${attemptNumber}/${MAX_RETRIES}: Failed to notify channel ${snowflake}: ${ex}`);
    debug && console.log(`Attempting to recover with client.fetchUser instead: ${snowflake}...`);
    
    client.fetchUser(snowflake).then(u => {
      console.log("Fetched user: " + u);
      if (!attemptNumber) {
        attemptNumber = 1;
      }
      while(!success && attemptNumber < MAX_RETRIES) {
        try {
          debug && console.log(`Found user: ${u}...`);
          performSend(u, message, additionalContent, attemptNumber);
          success = true;
          debug /*&& verbose*/ && console.log(`Successfully notified ${snowflake}`);
        } catch (innerEx) {
          attemptNumber++;
          console.log(`Attempt #${attemptNumber}/${MAX_RETRIES}: Failed to notify user ${channel} about ${message.title || message.content}: ${innerEx}`);
          console.log("Waiting 2s before retrying...");
          sleep.sleep(2);
          /*try {
            let member = client.server.members.get("id", snowflake);
            member.send(message);
          } catch (innerInnerEx) {
            console.log(`Attempt #${attemptNumber}/${MAX_RETRIES}: Failed to notify member ${channel} about ${message.title || message.content}: ${innerInnerEx}`);
          }*/
        }
      }
    }).catch(err => {
      // Try again...
      // TODO: I accidentally the whole channel... Is this bad?
      console.log(`Failed to fetchUser ${snowflake}: `, err);
      if (attemptNumber < MAX_RETRIES) {
        console.log("Waiting 2s before retrying...");
        sleep.sleep(2);
        return sendDM(channel, message, additionalContent || "", attemptNumber);
      } else {
        console.log(`Failed to send to ${snowflake} after ${MAX_RETRIES} attempts... aborting!`);
        return false;
      }
    });
  }
  
  // Signal to caller whether message sent successfully the first time
  // NOTE: it may still succeed on a asynchronously or on a subsequent call
  return success;
}

// Send an embed as a Direct Message
let sendEmbed = function(channel, embed, content) {
  if (content) {
    return sendDM(channel, {embed}, content)
  } else {
    return sendDM(channel, {embed});
  }
}

// DEPRECATED: Use MongoDB instead
let getEntry = function(user) {
  let entry = entries.find(ntry => ntry.user == user);

  // Create a new entry if one is not found for this user
  if (typeof entry === 'undefined') {
    entry = { user: user, words: [] };
    entries.push(entry)
  }
  return entries.find(ntry => ntry.user == user);
}

// DEPRECATED: Use MongoDB instead
let addWords = function(user, args) {
  let entry = getEntry(user);
  args.forEach(arg => {
    let trimmed = arg.replace(/[ \s]+/, "").trim();
    debug && console.log(`Checking trimmed arg: ${trimmed}...`);
    if (trimmed) { entry.words.push(trimmed); }
  });
}

// DEPRECATED: Use MongoDB instead
let rmWords = function(user, args) {
  let entry = getEntry(user);
  args.forEach(arg => {
    let index = entry.words.indexOf(arg);
    entry.words.splice(index, 1);
  });
}

let getHelpEmbed = function(user) {
  const embed = new Discord.RichEmbed()
        .setTitle(`Hi, ${user.username}!`)
        .setDescription(`I will store a list of words to watch for in the set of watched channels. I can match names, locations, or anything else that comes through in the messages on those channels. If any of your words match an incoming notification it will be forwarded to you in a Direct Message! NOTE: Match words and commands are not case sensitive.`)
        .addField("Help", "Displays this prompt")
        .addField("Test / Ping", "Tests if the bot is running. If you get no response, the bot is down.")
        .addField("Add", "Adds a word or list of words to match\nYou can use **-** to exclude a term, or **+** to denote multi-word terms\n\nFor example: `add unown lake+of+the+woods -tolono moltres`")
        .addField("List / Ls", "Replies with the list of words you are currently matching")
        .addField("Delete / Remove / Del / Rm", "Removes a word or list of words from your current match list\nFor example: `rm dratini lake+of+the+woods`")
        .addField("Clear", "Removes your entire list of filters")
        .addField("Support", `Sends a message to ${config.adminUserName}`)
        .setTimestamp();
  /*
  if (user.client.browser) {
    embed.addField("Watched Channels", `${config.watchedChannels.join(", ")}`);
  }*/
  return embed;
}

/**
 * Takes a message as argument and handles it appropriately.
 * First word must be a command word: either "list", "add", or "rm".
 * All other words are taken as a list of words to watch for.
 *
 * NOTE: Case is ignored.
 *
 * params:
 *    message: Message - the Message received by the bot
 */
let parsePrivateMsg = function(message) {
  // Ignore messages from this bot
  let user = message.author;
  if (user == config.botUser) {
    return;
  }
  
  let content = message.content.replace(/[, \s\t]+/, " ").trim();

  // Parse all words as a spec-separated list of match words
  let args = content.split(" ");

  // Parse first word as command word 
  let cmd = args.shift();

  let d = new Date(message.createdTimestamp);
  let timestamp = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  //let entry = getEntry(message.author);

  let collection = database.collection(collectionName);
  
  // DEBUG only!
  if (cmd === 'import' && user == config.adminUser) {
    let targetUser = args.shift();
    console.log(`Adding entries for user ${targetUser}: ${args.join(" ")}`);
    collection.find({ "_id": targetUser }).toArray(function(err, entries) {
      debug && console.log(`Found ${entries.length} results...`);
      let matchwords = [];
      if (entries.length > 0) {
        matchwords = entries[0].words;
      }
      
      matchwords = args.concat(matchwords).filter(onlyUnique);
      collection.updateOne({ "_id": targetUser }, { "$set": { words: matchwords } }, { upsert: true }, function(err, result) {
        let prettyPrinted = matchwords.join(" ");
        if (err) {
          console.log(`Failed to save matchwords for ${targetUser}: ${prettyPrinted}`);
        } else {
          sendDM(user, `Updated match words. Now watching: ${prettyPrinted}`);
          console.log(`Updated entries for user ${targetUser}: ${prettyPrinted}`);
        }
      });
    });
    return;
  }
  
  // DEBUG only!
  if (cmd === 'print' && user == config.adminUser) {
    let targetUser = args.shift();
    console.log(`Printing all entries...`);
    collection.find({}).toArray(function(err, entries) {
      entries.forEach(entry => {
        console.log(`${entry["_id"]} ${entry.words.join(" ")}`);
      });
      console.log(`Total: ${entries.length} results`);
    });
    return;
  }

  // If command word not recognized, quit out
  switch(cmd.toLowerCase()) {
    case "list":
    case "ls":
      debug && console.log(`Looking up entries for user ${user.id}...`);
      collection.find({ "_id": user.id }).toArray(function(err, entries) {
        debug && console.log(`Found ${entries.length} results...`);
        let matchwords = [];
        if (entries.length > 0) {
          matchwords = entries[0].words;
        }

        let prettyPrinted = matchwords.join(" ");
        console.log(`Listing entries for user ${user.id}: ${prettyPrinted}`);
        sendDM(user, `I am currently watching for: ${prettyPrinted}`);
      });
      break;

    case "add":
      console.log(`Adding entries for user ${user.id}: ${args.join(" ")}`);
      collection.find({ "_id": user.id }).toArray(function(err, entries) {
        debug && console.log(`Found ${entries.length} results...`);
        let matchwords = [];
        if (entries.length > 0) {
          matchwords = entries[0].words;
        }
        
        // Add all args to matchwords, ignoring duplicates
        matchwords = args.map(toLower).concat(matchwords).filter(onlyUnique);
        
        // Save our changes back to the db
        collection.updateOne({ "_id": user.id}, { "$set": { words: matchwords } }, { upsert: true }, function(err, result) {
          let prettyPrinted = matchwords.join(" ");
          if (err) {
            console.log(`Failed to save matchwords for ${user.id}: ${prettyPrinted}`);
          } else {
            sendDM(user, `Updated match words. Now watching for: ${prettyPrinted}`);
            console.log(`Updated entries for user ${user.id}: ${prettyPrinted}`);
          }
        });
      });
      break;

    case "delete":
    case "del":
    case "remove":
    case "rm":
      console.log(`Removing entries for user ${user.id}: ${args.join(" ")}`);
      //rmWords(entry.user, args);
      collection.find({ "_id": user.id }).toArray(function(err, entries) {
        debug && console.log(`Found ${entries.length} results...`);
        let matchwords = [];
        if (entries.length > 0) {
          matchwords = entries[0].words;
        }
        
        // Remove all args from matchwords
        args.map(toLower).forEach(arg => {
          let index = matchwords.indexOf(arg);
          if (index !== -1 ) {
            matchwords.splice(index, 1);
          }
        });
        
        // Save our changes back to the db
        collection.updateOne({ "_id": user.id }, { "$set": { words: matchwords } }, { upsert: true }, function(err, result) {
          let prettyPrinted = matchwords.join(" ");
          if (err) {
            console.log(`Failed to save matchwords for ${user.id}: ${prettyPrinted}`);
          } else {
            sendDM(user, `Updated match words. Now watching for: ${prettyPrinted}`);
            console.log(`Updated entries for user ${user.id}: ${prettyPrinted}`);
          }
        });
      });
      break;

    case "clear":
      console.log(`Clearing all entries for user ${user.id}...}`);
      collection.removeOne({ "_id": user.id }).then(function() {
        console.log(`Removed all entries for user ${user.id}`);
        sendDM(user, `Removed all match words!`);
      });
      break;
      
    case "ping":
    case "test":
      sendDM(user, "Dispatch Notify Bot, reporting for duty!");
      console.log(`Ping from ${user}`);
      break;
      
    case "testnotify":
      console.log("Sending test notification embed to admin user...");
      // Generated with https://leovoel.github.io/embed-visualizer/
      let testNotification = new Discord.RichEmbed()
        .setTitle("[Dodds Park] Raid against Snorlax!")
        .setDescription("Until 05:39:30pm (1h 59m).")
        .setColor("#42f450")
        .setTimestamp()
        .setThumbnail("https://images-ext-1.discordapp.net/external/oQlu8-eSFf7BuFOVYRZSzfDFKnCd93fWjrBLUyLq0xI/https/raw.githubusercontent.com/kvangent/PokeAlarm/master/icons/143.png?width=80&height=80")
        .setImage("https://maps.googleapis.com/maps/api/staticmap?center=40.11727,-88.286997&markers=color:red%7C40.11727,-88.286997&maptype=roadmap&size=250x125&zoom=14&key=AIzaSyBq3d0jrrruVDg8fcF5tSHpOB2J_bpbzX8")
        .setAuthor("Snorlax", "https://images-ext-1.discordapp.net/external/oQlu8-eSFf7BuFOVYRZSzfDFKnCd93fWjrBLUyLq0xI/https/raw.githubusercontent.com/kvangent/PokeAlarm/master/icons/143.png?width=80&height=80", "http://maps.google.com/maps?q=40.11727,-88.286997")
        .setURL("http://maps.google.com/maps?q=40.11727,-88.286997")
        .addField("Matched Word", "**snorlax**", true);

      sendEmbed(config.adminUser, testNotification);
      break;
      
    case "testcheck":
     let testEmbed = new Discord.RichEmbed()
        .setTitle("[TestLocation] This is a testquery!")
        .setDescription("Please disregard.\nIf you received this notification, it was an error. Please report this to @crowley.\nAdditional text: " + args)
        .setColor("#42f450")
        .setTimestamp()
        .setThumbnail("https://images-ext-1.discordapp.net/external/oQlu8-eSFf7BuFOVYRZSzfDFKnCd93fWjrBLUyLq0xI/https/raw.githubusercontent.com/kvangent/PokeAlarm/master/icons/143.png?width=80&height=80")
        .setImage("https://maps.googleapis.com/maps/api/staticmap?center=40.11727,-88.286997&markers=color:red%7C40.11727,-88.286997&maptype=roadmap&size=250x125&zoom=14&key=AIzaSyBq3d0jrrruVDg8fcF5tSHpOB2J_bpbzX8")
        //.setAuthor("Snorlax", "https://images-ext-1.discordapp.net/external/oQlu8-eSFf7BuFOVYRZSzfDFKnCd93fWjrBLUyLq0xI/https/raw.githubusercontent.com/kvangent/PokeAlarm/master/icons/143.png?width=80&height=80", "http://maps.google.com/maps?q=40.11727,-88.286997")
        .setURL("http://maps.google.com/maps?q=40.11727,-88.286997")
        .addField("Matched Word", "**testquery**", true);
      let testMessage = {
        author: config.adminUser,
        channel: config.watchedChannels[0],
        embeds: [richToMsgEmbed(testEmbed)],
        content: "TestLocation"
      };
      handleNotification(testMessage);
      break;
      
    case "support":
      sendDM(config.adminUser, `Hi, ${config.adminUser}! ${user} asked for help on ${timestamp}: ${message.content}`);
      console.log(`[${timestamp}] ${message.author} needs support: ${message.content}`);
      break;
      
    case "help":
      console.log(`Printing help text for user ${user.id}`);
      const embed = getHelpEmbed(user);
      sendEmbed(user, embed);
      break;

    default:
      console.log(`Unrecognized command "${cmd}"...`);
      sendDM(user, `Unrecognized command "${cmd}"... Respond with "help" to see accepted commands.`);
      debug && console.log(`[${timestamp}] ${message.author}: ${message.content}`);
      break;
  }
}


let notify = function(user, msgEmbed, content, matchedWord) {
      let name = msgEmbed.title.split(" -")[0];
      let location = content.replace(/ <.*>/, "");
      let thumbnail = msgEmbed.thumbnail.url;
      let image = msgEmbed.image.url;
      let url = msgEmbed.url;

      let embed = new Discord.RichEmbed()
        .setTitle(msgEmbed.title)
        .setDescription(msgEmbed.description)
        .setColor("#42f450")
        .setTimestamp()
        .setThumbnail(thumbnail)
        .setImage(image)
        //.setAuthor(name, thumbnail, url)
        .setURL(url);

      if (matchedWord) {
        embed.addField("Matched Word", `${matchedWord}`, true)
      }


        //let forwardedEmbed = msgEmbedToRich(embed).addField("Matched Word", `${matchedWord}`, true);
        //sendDM(entry.user, "Your filters matched a new notification:");
        sendEmbed(user, embed, `${location}: ${name}`); 

};

// Messages can be duplicated if they are sent to multiple channels
// FIXME: This is a really hacky way of ignoring duplicates
let newestNotification = null;

/**
 * Takes a message as argument and handles it appropriately.
 * First word must be a command word: either "list", "add", or "rm".
 * Second word should be a type: either "word" or "phrase" (word is default if missing)
 * All other words are taken as a list of words to watch for.
 * The keyword "all" will also be accepted, and will 
 * operate on the full list of words for this user.
 *
 * params:
 *    message: Message - the Message received by the bot
 */
let handleNotification = function(message) {
  let content = message.content.toLowerCase();
  
  // Notifications should a RichEmbed.. parse it
  message.embeds.forEach(msgEmbed => {
    let title = msgEmbed.title.toLowerCase();
    let description = msgEmbed.description.toLowerCase();
    let fullText = `${title} - ${description}`;
    
    if (fullText === newestNotification) {
      // Already handled this notification... skipping
      console.log(`Skipping duplicate notification: ${fullText.replace(/[\n\r+]/g, " ")}`);
      return;
    } else {
      newestNotification = fullText;
    }
    
    fullText = `${content} - ${fullText}`.replace(/[\n\r+]/g, " ");
    debug && console.log(`Handling embed: ${fullText}`);
    
    // Scrape GPS location from Google Maps URL
    let gps = null;
    if (msgEmbed.image.url.indexOf("center=") !== -1) {
        gps = msgEmbed.image.url.split("center=")[1];
        gps = gps.split("&")[0];
        debug && console.log(`GPS location found: "${gps}" - is this correct?`);
    }

    // If this is an unown, notify #general and make special beep beep noises
    if (title.indexOf('unown') !== -1) {
      console.log(`!!!  ALERT  !!!    I found an UNOWN! GET IT!!!`);
      
      const unown = client.emojis.find("name", "unown");
      // TODO: After testing that it works, add an "@everyone" mention
      sendDM(config.adminUser, `${unown} ${unown} ${unown}  Unown detected in the vicinity!!!  ${unown} ${unown} ${unown}`);
      sendDM(config.generalChannel, `${unown} ${unown} ${unown}  Unown detected in the vicinity!!!  ${unown} ${unown} ${unown}`);
      
      beep(100, 500);
    }
    
    // Find all user filter entries in the database
    // TODO: Make this smarter... don't loop every every person for every message
    let collection = database.collection(collectionName);
    collection.find({}).toArray(function(err, entries) {
      // For each user's entry, test if this matches any filters
      entries.forEach(entry => {
        debug && verbose && console.log(`Checking for user: ${entry["_id"]}`);
        let skip = false;
        let wordsArr = entry.words;

        // Handle Regex
        let regexes = skip ? [] : wordsArr.filter(word => word.indexOf("?") === 0) || [];
        for (let i = 0; !skip && i < regexes.length; i++) {
          let regex = new RegExp(regexes[i].slice(1).replace(/\+/g, ".*"));
          if (fullText.match(regex)) {
            let matchText = `regex=${regex}`;
            debug && console.log(`Regex match found: "${matchText}`);
            notify(entry["_id"], msgEmbed, message.content, matchText);
            skip = true;
            break;
          }
        }

        // Detect fuzzy matches with a special operator
        let fuzzies = skip ? [] : wordsArr.filter(word => word.indexOf("*") === 0) || [];
        for (let i = 0; !skip && i < fuzzies.length; i++) {
          let fuzzy = fuzzies[i].slice(1).replace(/\+/g, " ");
          let score = fullText.score(fuzzy);
          if (score && (0.5 <= score)) {
            let matchText = `fuzzy="${fuzzy}" score=${score}`;
            debug && console.log(`Fuzzy match found: "${matchText}`);
            notify(entry["_id"], msgEmbed, message.content, matchText);
            skip = true;
            break;
          }
        }


        // Retrieve the user's search excludes
        let excludes = skip ? [] : wordsArr.filter(word => word.indexOf("-") === 0) || [];
        
        // Check if this has an excluded terms in it (if so, ignore it)
        for (let i = 0; i < excludes.length; i++) {
          // Get the exclude text (slice off the prefix "-")
          let exclude = excludes[i].slice(1).replace(/\+/g, " ");
          debug && verbose && console.log(`Checking if text contains excluded term ${exclude}: ${fullText.indexOf(exclude) !== -1}`);
          if (fullText.indexOf(exclude) !== -1) {
            debug && console.log(`Skipping notify user ${entry["_id"]}: ${exclude} has been requested to be ignored`);
            skip = true;
            break;
          }
        }
        
        // Handle geo bounding box
        let points = skip ? [] : wordsArr.filter(word => word.indexOf(".") === 0) || [];
        for (let i = 0; !skip && i < points.length; i++) {
	  try {


          let gpsBoundingBox = points[i].slice(1);
          let pts = gpsBoundingBox.split(":");
          if (pts.length < 2) {
             debug && console.log(`WARNING: Skipping malformed bounding box ${gpsBoundingBox}`);
             continue;
          }
          
          // Determine actual X/Y coordinates
          let actualCoords = gps.split(",");
          let actualX = parseFloat(actualCoords[0]);
          let actualY = parseFloat(actualCoords[1]);

          // Determine start X/Y coordinates of box
          let start = pts[0].split(",");
          let startX = parseFloat(start[0]);
          let startY = parseFloat(start[1]);

          // Determine end X/Y coordinates of box
          let end = pts[1].split(",");
          let endX = parseFloat(end[0]);
          let endY = parseFloat(end[1]);

          // Compare piecewise to determine membership
          if ((startX <= endX && startY <= endY && actualX >= startX && actualY >= startY && actualX <= endX && actualY <= endY)
               || (startX >= endX && startY <= endY && actualX <= startX && actualY >= startY && actualX >= endX && actualY <= endY) 
               || (startX <= endX && startY >= endY && actualX >= startX && actualY <= startY && actualX <= endX && actualY >= endY)
               || (startX >= endX && startY >= endY && actualX <= startX && actualY <= startY && actualX >= endX && actualY >= endY)) {
            let matchText = `box=${gpsBoundingBox}`;
            debug && console.log(`Regex match found: "${matchText}`);
            notify(entry["_id"], msgEmbed, message.content, matchText);
            skip = true;
          }
	  } catch (e) {
		console.log("Failed to check GPS box: Bad format? " + gpsBoundingBox);
	  }
        }
        
        // Retrieve the user's search words
        let exactQueries = wordsArr.filter(word => word.indexOf("-") !== 0 && word.indexOf("?") !== 0 && word.indexOf(".") !== 0 && word.indexOf("*"));
        let words = skip ? [] : exactQueries || [];
        if (!exactQueries || !exactQueries.length) {
          console.log(`WARNING: empty word list found for user: ${entry["_id"]}`);
        }

        // If this matches any of their targets, forward the notification to the user
        for (let i = 0; i < words.length; i++) {
          let word = words[i].toLowerCase();
          if (!word || !word.trim()) { 
            debug && console.log(`Skipping empty word:  ${word}.`);
            continue; 
          }
          debug && verbose && console.log(`Checking if text contains ${word}: ${fullText.indexOf(word) !== -1}`);
          word = word.replace(/\+/g, " ");
          // If any of this user's filters match, notify them
          if (fullText.indexOf(word) !== -1) {
            debug && console.log(`Notifying user: ${entry["_id"]} about "${word}"`);
            notify(entry["_id"], msgEmbed, message.content, word); 
            break;
          }
        }
      });
    });
  });

  debug && console.log(`Done sending!`);  
}

/**
 * Handler for all messages received by the bot.
 */
client.on('message', message => {
  // Notify approriate users when a notification comes
  // TODO: Allow user to choose which words in which channels?
  let channels = config.watchedChannels;
  for(let i = 0; i < channels.length; i++) {
    let wChannel = channels[i];
    if (message.channel == wChannel) {
      handleNotification(message);
      return;
    }
  }
  
  // Handle mentions of the bot's name in public channels
  if (message.content.indexOf(config.botUser) === 0) {
    let parsedCmd = message.content.split(" ");
    debug && console.log(`Did someone say my name? ${message.author}: ${message.content} - (${parsedCmd})`);
    if (parsedCmd.length > 1) {
      parsedCmd.forEach(user => {
        if (user == config.botUser) {
          console.log(`Skipping bot user: ${config.botUser}`);
        } else if (user.indexOf("@") !== -1) {
          console.log(`Sending help text indirectly to ${user}...`);
          sendEmbed(user, getHelpEmbed(user));
        } else {
          console.log(`Skipping ${user}: does not match expected format`);
        }
      });
    } else {
      let user = message.author;
      console.log(`Sending help text directly to ${user}...`);
      sendEmbed(user, getHelpEmbed(user));
    }
    return;
  }
  
  // Handle direct messages as a request to change the author's filter settings
  if (message.channel.toString().indexOf("@") !== -1) {
    parsePrivateMsg(message);
    return;
  }

  // TODO: What to do with other messages?
  // DEBUG ONLY: this can get pretty noisy
  //let d = new Date(message.createdTimestamp);
  //debug && console.log(`It's not very effective... [${d.toLocaleDateString()} ${d.toLocaleTimeString()}] ${message.author}: ${message.content}`);
});

// Login with our bot's access token
// Do NOT commit this token to source control
client.login(config.token);

