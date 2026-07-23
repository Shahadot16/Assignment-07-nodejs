const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const htmlPath = path.join(__dirname, 'random.html');
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, htmlContent) {
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  res.end(htmlContent);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      resolve(body);
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

function extractGeneratedText(payload) {
  const firstChoice = payload?.choices?.[0];

  if (firstChoice?.message?.content) {
    return firstChoice.message.content;
  }

  if (firstChoice?.text) {
    return firstChoice.text;
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    fs.readFile(htmlPath, 'utf8', (error, htmlContent) => {
      if (error) {
        sendJson(res, 500, { error: 'Failed to read HTML file.' });
        return;
      }

      sendHtml(res, htmlContent);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/ai') {
    try {
      const bodyText = await readBody(req);
      const requestBody = JSON.parse(bodyText || '{}');
      const prompt = String(requestBody.prompt || '').trim();

      if (!prompt) {
        sendJson(res, 400, { error: 'Prompt is required.' });
        return;
      }

      if (!GROQ_API_KEY) {
        sendJson(res, 500, { error: 'GROQ_API_KEY is not set in environment variables.' });
        return;
      }

      const groqResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7
        })
      });

      const groqData = await groqResponse.json();

      if (!groqResponse.ok) {
        const errorMessage = groqData?.error?.message || 'Groq API request failed.';
        throw new Error(errorMessage);
      }

      const generatedText = extractGeneratedText(groqData);

      if (!generatedText) {
        throw new Error('Invalid AI response format.');
      }

      sendJson(res, 200, { result: generatedText });
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Something went wrong.' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Route not found.' });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
