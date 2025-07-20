const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Configuration
const TELEGRAM_TOKEN = '7454733028:AAEEGmZe1-wd2Y8DfriKwMe7px9mSP3vS_I';
const CHANNEL_ID = '2178270630'; // Your numeric channel ID
const bot = new TelegramBot(TELEGRAM_TOKEN);

// RSS Feeds to Monitor
const RSS_FEEDS = [
  'https://rss.app/feeds/ZRbnX9kDtoksyRLe.xml',
  'https://rss.app/feeds/oiRhIksVMVtKVKab.xml'
];

// Enhanced tracking system
const postTracker = {
  processed: new Set(),
  maxStored: 100, // Prevent memory overload
  add: function(url) {
    if (this.processed.size >= this.maxStored) {
      const first = this.processed.values().next().value;
      this.processed.delete(first);
    }
    this.processed.add(url);
  }
};

const CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes

console.log(`
=====================================
  FILMYZILLA RSS SCRAPER BOT
  Channel: ${CHANNEL_ID}
  Monitoring ${RSS_FEEDS.length} RSS feeds...
=====================================
`);

// Enhanced scraping with retry logic
async function scrapeMovieLinks(postUrl, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data } = await axios.get(postUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(data);
      const title = $('div.head').first().text().trim();
      const results = [];

      $('div.touch').each((i, el) => {
        const quality = $(el).find('a font').text().trim();
        const serverPath = $(el).find('a').attr('href');
        const size = $(el).find('small span').text().trim();

        if (quality && serverPath) {
          results.push({
            quality,
            serverUrl: new URL(serverPath, postUrl).href,
            size: size || 'Size not available'
          });
        }
      });

      return { 
        title: title || 'Untitled Post',
        links: results.length ? results : null
      };
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

// Improved download link extraction
async function getDownloadLinks(serverUrl) {
  try {
    const { data } = await axios.get(serverUrl, { 
      timeout: 8000,
      maxRedirects: 3
    });
    const $ = cheerio.load(data);
    
    // Multiple fallback selectors
    const downloadPath = $('a.newdl').attr('href') || 
                       $('a[href*="/downloads/"]').attr('href');
    
    if (!downloadPath) throw new Error('No download link detected');
    
    const finalUrl = new URL(downloadPath, serverUrl).href;
    
    // Validate URL
    if (!finalUrl.includes('filmyzilla15.com')) {
      throw new Error('Invalid download URL');
    }
    
    return finalUrl;
  } catch (error) {
    console.error(`Download link error (${serverUrl}): ${error.message}`);
    return null;
  }
}

// Feed processing with enhanced logging
async function processFeeds() {
  const parser = new Parser();
  const newPosts = [];
  
  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      console.log(`[${new Date().toISOString()}] Processing ${feed.items.length} items from ${feedUrl}`);

      for (const item of feed.items) {
        if (!postTracker.processed.has(item.link)) {
          newPosts.push(item);
          postTracker.add(item.link);
        }
      }
    } catch (error) {
      console.error(`Feed processing error (${feedUrl}): ${error.message}`);
    }
  }

  return newPosts.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

// Telegram message sender with rate limiting
async function sendToChannel(message) {
  try {
    await bot.sendMessage(CHANNEL_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      disable_notification: false
    });
    console.log(`Message sent to channel ${CHANNEL_ID}`);
    return true;
  } catch (error) {
    console.error(`Telegram send error: ${error.message}`);
    
    // If rate limited, wait and retry
    if (error.response && error.response.statusCode === 429) {
      const retryAfter = error.response.parameters.retry_after || 30;
      console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return sendToChannel(message);
    }
    
    return false;
  }
}

// Main checking function
async function checkFeeds() {
  try {
    console.log(`\n[${new Date().toISOString()}] Starting feed check`);
    
    const newPosts = await processFeeds();
    if (!newPosts.length) {
      console.log('No new posts found');
      return;
    }

    console.log(`Found ${newPosts.length} new posts`);
    
    for (const post of newPosts) {
      try {
        const movieData = await scrapeMovieLinks(post.link);
        if (!movieData || !movieData.links) continue;

        let message = `🎬 <b>${escapeHtml(movieData.title)}</b>\n\n`;
        message += `📅 <i>${post.pubDate ? new Date(post.pubDate).toLocaleString() : 'Date not available'}</i>\n`;
        message += `🔗 <a href="${post.link}">View Original Post</a>\n\n`;

        // Process all download links
        const validLinks = [];
        for (const link of movieData.links) {
          const finalLink = await getDownloadLinks(link.serverUrl);
          if (finalLink) {
            validLinks.push({ ...link, finalLink });
          }
        }

        // Only send if we have valid links
        if (validLinks.length) {
          // Group by quality type
          const grouped = {};
          validLinks.forEach(link => {
            const key = link.quality.split(' ')[0]; // 480p, 720p etc
            grouped[key] = grouped[key] || [];
            grouped[key].push(link);
          });

          // Format message with grouped links
          for (const [quality, links] of Object.entries(grouped)) {
            message += `<b>${quality.toUpperCase()} OPTIONS</b>\n`;
            links.forEach(link => {
              message += `➤ ${link.quality.replace(quality, '').trim()} (${link.size})\n`;
              message += `<code>${link.finalLink}</code>\n\n`;
            });
          }

          await sendToChannel(message);
          
          // Delay between posts to avoid flooding
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Error processing post ${post.link}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Global feed check error:', error);
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Start monitoring
setInterval(checkFeeds, CHECK_INTERVAL);
checkFeeds(); // Initial check

// Health endpoint
app.get('/', (req, res) => res.json({
  status: 'active',
  channel: CHANNEL_ID,
  feeds: RSS_FEEDS.map(f => f.split('/').pop()),
  trackedPosts: postTracker.processed.size,
  lastChecked: new Date().toISOString()
}));

app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  console.log('Bot is actively monitoring for new posts');
});
