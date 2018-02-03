/** Do NOT commit this file to source control */
/**
 * Discord leverages Twitter's "Snowflake" concept to generate unique IDs
 *
 *
 * Channel IDs use the following format:   '<#123456789012345>'
 * User IDs use the following format:      '<@123456789012345>'
 * Usernames use the following format:     '@BigDaddyAdmin'
 *    This may vary with nicknames set - untested
 *
 *  For more details, see https://discordapp.com/developers/docs/reference
 */

// The id of this Bot user
const BOT_USER_ID = '';

// The id/name of this Bot's Administrator user
const ADMIN_USER_ID = '';
const ADMIN_USER_NAME = '';

// The id of the #general channel
const DEFAULT_CHANNEL_ID = '';

// The list of channels to watch for message embeds
const WATCHED_CHANNELS = [
	// Add a comma-separated list of Channel IDs here
];

// The Bot Account's authentication Token string
// XXX: To create a new Bot on your Discord account, 
//   visit https://discordapp.com/developers/applications/me
const BOT_TOKEN = '';

// Map these values back to the names that bot.js expects
module.exports = {
  token: BOT_TOKEN,
  watchedChannels: WATCHED_CHANNELS,
  generalChannel: DEFAULT_CHANNEL_ID,
  adminUser: ADMIN_USER_ID,
  adminUserName: ADMIN_USER_NAME,
  botUser: BOT_USER_ID
};
