const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 5001;

app.get('/api/scrape-performance', async (requestAnimationFrame, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();

        // authenticate into website
        await page.authenticate({
            username: 'report',
            password: 'K1CRvBnqJPC9'
        });

        // navigate to target page
        await page.goto('https://reporting.handwrytten.com/performance', {
            waitUntil: 'networkidle2'
        });

        await page.waitForSelector('.text.number');
        const numbers = await page.evaluate(() => Array.from(document.querySelectorAll('.text.number')).map((el) => el.textContent.trim()))

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
