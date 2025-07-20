const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

// Initialize Express app for Render.com
const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your Telegram Bot Token
const TELEGRAM_TOKEN = '7454733028:AAEEGmZe1-wd2Y8DfriKwMe7px9mSP3vS_I';

// Create a bot instance
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log(`
=====================================
  FILMYZILLA DOWNLOAD LINK SCRAPER BOT
  Telegram Bot Started Successfully!
=====================================
`);

// Start command handler
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMsg = `🎬 <b>Filmyzilla Download Link Scraper Bot</b>\n\n`
    + `Send me any Filmyzilla movie post URL and I'll extract all download links for you.\n\n`
    + `Example:\n<code>https://www.filmyzilla15.com/movie/20516/Saiyaara-(2025)-hindi-movie.html</code>`;
  
  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML' });
});

// Help command handler
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Just send me a valid Filmyzilla movie URL to get download links.', {
    parse_mode: 'HTML'
  });
});

// Main function to scrape download links
async function scrapeFilmyzillaLinks(url) {
  try {
    // Fetch the movie page
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Extract movie title
    const title = $('div.head').text().trim();

    // Extract all download links
    const links = [];
    $('div.touch').each((index, element) => {
      const quality = $(element).find('a font').text().trim();
      const relativeLink = $(element).find('a').attr('href');
      const size = $(element).find('small span').text().trim();

      if (quality && relativeLink) {
        links.push({
          quality,
          url: new URL(relativeLink, url).href,
          size
        });
      }
    });

    // Now get final download links from each server page
    const finalLinks = [];
    for (const link of links) {
      try {
        const { data: serverData } = await axios.get(link.url);
        const $server = cheerio.load(serverData);
        
        const downloadPath = $server('a.newdl').attr('href');
        if (downloadPath) {
          finalLinks.push({
            title: title,
            quality: link.quality,
            downloadLink: new URL(downloadPath, link.url).href,
            size: link.size
          });
        }
      } catch (error) {
        console.error(`Error processing ${link.quality}: ${error.message}`);
      }
    }

    return finalLinks;
  } catch (error) {
    console.error('Scraping error:', error.message);
    throw new Error('Failed to scrape the URL. Please check if it\'s valid.');
  }
}

// Handle incoming messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userInput = msg.text;

  // Ignore commands
  if (userInput.startsWith('/')) return;

  // Check if it's a valid Filmyzilla URL
  if (!userInput.includes('filmyzilla15.com')) {
    return bot.sendMessage(chatId, '⚠️ Please send a valid Filmyzilla URL.');
  }

  try {
    // Send "processing" message
    const processingMsg = await bot.sendMessage(chatId, '🔍 Processing your request...');

    // Scrape the links
    const links = await scrapeFilmyzillaLinks(userInput);

    if (links.length === 0) {
      await bot.editMessageText('❌ No download links found.', {
        chat_id: chatId,
        message_id: processingMsg.message_id
      });
      return;
    }

    // Prepare the response
    let response = `<b>${links[0].title}</b>\n\n`;
    links.forEach((link, index) => {
      response += `<b>${index + 1}. ${link.quality}</b> (${link.size})\n`;
      response += `<a href="${link.downloadLink}">Download Link</a>\n\n`;
    });

    // Send the results
    await bot.editMessageText(response, {
      chat_id: chatId,
      message_id: processingMsg.message_id,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Dummy server for Render.com
app.get('/', (req, res) => {
  res.send(`
    <h1>Filmyzilla Scraper Bot</h1>
    <p>Bot is running and ready to process requests on Telegram</p>
    <p>Find the bot at: <a href="https://t.me/filmyzilla_scraper_bot">@filmyzilla_scraper_bot</a></p>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Bot is ready to receive requests on Telegram`);
});
