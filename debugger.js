// Discord.js and friends
const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.js');

// Official MongoDB Driver
const MongoClient = require('mongodb').MongoClient
const assert = require('assert');

// Logging switches
const debug = true;
const verbose = false;

// MongoDB URL
const mongoUrl = 'mongodb://dispatch-mongo:27017/dispatch-notify-bot';
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
/*(function() {
  debug && console.log(`${database === null ? 'C' : 'Rec'}onnecting to MongoDB at ${mongoUrl}...`);
  return MongoClient.connect(mongoUrl, mongoOpts, function(err, db) {
    assert.equal(null, err);
    console.log(`${database === null ? 'C' : 'Rec'}onnected to MongoDB at ${mongoUrl}`);
    assert.notEqual(null, database = db);
  });
})();*/

// Workaround... see https://github.com/hydrabolt/discord.js/issues/1685#issuecomment-315620118
client.on('disconnect', function () {
	clearTimeout(client.ws.connection.ratelimit.resetTimer);
});

let shutdown = function() {
  console.log("Stopping Dispatch Notify Bot...");
  client.destroy(function () {
    console.log("Logged out of Discord");
  });
  
  /*database.close(false, function(err, result) {
    if (err) {
      console.log("Error encountered closing MongoDB connection", err);
    } else {
      console.log("MongoDB connection closed successfully");
    }
  });*/
  
  console.log("Dispatch Notify Bot has been stopped");
}
process.on( 'SIGTERM', function () {  shutdown();  });
process.on( 'SIGINT', function () {  shutdown();  });
process.on('unhandledRejection', console.error);

// Log startup events
debug && console.log("Starting Dispatch Debugger...");
client.on('ready', () => {
  debug && console.log(`Logged in as ${client.user.tag} for debugging!`);
});

let lastNotification = null;

let prettyPrint = function(message, forward) {
  // TODO: What to do with other messages?
  // DEBUG ONLY: this can get pretty noisy
  let d = new Date(message.createdTimestamp || message.timestamp);
  debug && console.log(`[${d.toLocaleDateString()} ${d.toLocaleTimeString()}] ${message.author}: ${message.content}`);
  message.embeds.forEach(msgEmbed => {
    //console.log("  Author:", msgEmbed.author);
    console.log("  Title:", msgEmbed.title);
    console.log("  Description:", msgEmbed.description);
//    console.log("  Color:", msgEmbed.color);     // cannot convert to string
//    console.log("  Client:", msgEmbed.client);   // super verbose
    //console.log("  Created At:", msgEmbed.createdAt);
    //console.log("  Created Timestamp:", msgEmbed.createdTimestamp);
//    console.log("  HexColor:", msgEmbed.hexColor); // probably cannot convert to string
    console.log("  Image:", msgEmbed.image.url);
    //console.log("  Provider:", msgEmbed.provider);
    console.log("  Thumbnail:", msgEmbed.thumbnail.url);
    console.log("  Type:", msgEmbed.type);
    console.log("  Url:", msgEmbed.url);
    //console.log("  Video:", msgEmbed.video);
    //console.log("  Footer", msgEmbed.footer);
    
    for (let i = 0; i < msgEmbed.fields.length; i++) {
      let field = msgEmbed.fields[i];
      console.log(`  Field ${i+1} name:`, field.name);
      console.log(`  Field ${i+1} value:`, field.value);
    }

    if (lastNotification === `${msgEmbed.title} - ${msgEmbed.description}`) {
      return;
    }
    
    lastNotification = `${msgEmbed.title} - ${msgEmbed.description}`;
    
    // FIXME: For some reason, Girafarig notifications from Monocle come through as blank
    if (forward || msgEmbed.title.indexOf("Girafarig") !== -1) {
      //let embed = msgEmbedToRich(msgEmbed);
      let name = msgEmbed.title.split(" -")[0];
      let thumbnail = msgEmbed.thumbnail.url;
      let image = msgEmbed.image.url;
      let url = msgEmbed.url;
      let location = message.content.replace(/ <.*>/, "");
      
      let embed = new Discord.RichEmbed()
        .setTitle(msgEmbed.title)
        .setDescription(msgEmbed.description)
        .setColor("#42f450")
        .setTimestamp()
        .setThumbnail(thumbnail)
        .setImage(image)
        //.setAuthor(name, thumbnail, url)
        .setURL(url)
        //.addField("Matched Word", "girafarig test", true)
        
      console.log("Forwarding embed:", embed);

      client.fetchUser(config.adminUser).then(u => {
        u.send(`${location}: ${name}`, { embed: embed })
          .then(message => {
            debug && console.log(`Sent message to admin user:`);
            prettyPrint(message, false);
          })
          .catch(err => console.log(`Failed to send message to admin user: ${err}`))
      });
    }
  });
  console.log("");
  console.log("");
};


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
      //handleNotification(message);
      prettyPrint(message, false);
      return;
    }
  }
});

// Login with our bot's access token
// Do NOT commit this token to source control
client.login(config.token);
