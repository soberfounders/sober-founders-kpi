const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function updatePage() {
  const url = process.env.WP_SITE_URL;
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  if (!url || !username || !appPassword) {
    console.error("Missing WP credentials in .env");
    process.exit(1);
  }

  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  try {
    const searchRes = await fetch(`${url}/wp-json/wp/v2/pages?slug=advertising`, { headers });
    const searchData = await searchRes.json();
    
    if (!searchData || searchData.length === 0) {
      console.error("Page with slug 'advertising' not found");
      process.exit(1);
    }
    
    const pageId = searchData[0].id;
    console.log(`Found page ID: ${pageId}`);
    
    const htmlPath = path.join(__dirname, 'advertising-landing-page.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    let contentToPush = htmlContent;
    const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const scriptMatch = htmlContent.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    
    if (bodyMatch && styleMatch) {
        // Enclose inside Gutenberg HTML block wrapper
        contentToPush = `<!-- wp:html -->\n<style>${styleMatch[1]}</style>\n<div class="sf-custom-advertising-page">\n${bodyMatch[1]}\n${scriptMatch ? `<script>${scriptMatch[1]}</script>` : ''}\n</div>\n<!-- /wp:html -->`;
    }
    
    const updateRes = await fetch(`${url}/wp-json/wp/v2/pages/${pageId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: contentToPush
      })
    });
    
    const updateData = await updateRes.json();
    if (updateData.id) {
      console.log('Successfully updated the page.');
    } else {
      console.error('Failed to update page:', updateData);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

updatePage();
