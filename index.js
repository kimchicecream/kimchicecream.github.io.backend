const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = [
    'http://localhost:3000',
    'https://alexharimgo.com'
];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    })
);

app.get('/api/scrape-performance', async (requestAnimationFrame, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        //test

        const page = await browser.newPage();

        // authenticate into website
        try {
            await page.authenticate({
                username: 'report',
                password: 'K1CRvBnqJPC9'
            });
        } catch (authError) {
            console.error('Authentication failed:', authError);
            res.status(401).json({ error: 'Authentication failed. Check credentials.' });
            return;
        }

        // navigate to target page
        await page.goto('https://reporting.handwrytten.com/performance', {
            waitUntil: 'networkidle2'
        });

        await page.waitForSelector('g.trace text.number');
        const numbers = await page.evaluate(() => Array.from(document.querySelectorAll('g.trace text.number')).map((el) => el.textContent.trim()))

        await browser.close();

        res.json(numbers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to scrape data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
