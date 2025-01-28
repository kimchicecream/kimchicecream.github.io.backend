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

// SCRAPE reporting.handwrytten.com/performance
app.get('/api/scrape-performance', async (req, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            // maybe add more?
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-gpu'
            ]
        });

        //test

        const page = await browser.newPage();

        // disable images, fonts, stylesheets
        await page.setViewport({ width: 800, height: 600 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

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
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForSelector('g.trace text.number');
        const numbers = await page.evaluate(() => Array.from(document.querySelectorAll('g.trace text.number')).map((el) => el.textContent.trim()))

        await page.close();
        await browser.close();

        res.json(numbers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to scrape data' });
    }
});

// SCRAPE 192.168.0.91/jobs
app.get('/api/scrape-jobs', async (req, res) => {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // disable images, fonts, stylesheets
        await page.setViewport({ width: 800, height: 600 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        //navigate to the local network page
        await page.goto('http://192.168.0.100/jobs', { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForSelector('tbody tr', { timeout: 15000 });

        const extractedData = await page.evaluate(() => {
            const rows = Awway.from(document.querySelectorAll('tbody tr'));

            let groupedData = [];
            let currentGroup = null;

            rows.forEach((row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                const rowData = cells.map(td => td.textContent.trim());

                // checks if this row contains a <strong> with ".pdf"
                const hasPdf = cells.some(td => {
                    const strong = td.querySelector('strong');
                    return strong && strong.textContent.trim().endsWith('.pdf');
                });

                if (hasPdf) {
                    // start a new group when a new PDF is found
                    if (currentGroup) {
                        groupedData.push(currentGroup); // save the previous group
                    }
                    currentGroup = {
                        pdfFile: rowData[0], // store the .pdf filename
                        dataRows: []         // initialize an empty array for its rows
                    };
                } else if (currentGroup) {
                    // add row data to the current PDF group
                    currentGroup.dataRows.push(rowData);
                }
            });

            // push the last captured group
            if (currentGroup) {
                groupedData.push(currentGroup);
            }

            return groupedData;
        });

        await page.close();
        await browser.close();

        res.json({ extractedData });
    } catch (error) {
        console.error('Error scraping job data:', error);
        await page.close();
        res.status(500).json({ error: 'Failed to scrape job data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
