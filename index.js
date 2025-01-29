const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = [
    'http://localhost:3000',
    'https://alexharimgo.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.options('*', (req, res) => {
    const origin = allowedOrigins.includes(req.headers.origin) ? req.headers.origin : 'https://alexharimgo.com';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

let cache = null;
let lastFetchedTime = 0;
let browser;

// keep puppeteer running for optimization
async function getBrowserInstance() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-gpu'
            ]
        });
    }
    return browser;
}

// SCRAPE reporting.handwrytten.com/performance
app.get('/api/scrape-performance', async (req, res) => {
    try {
        // if cached data exists and is less than 2 min old, return cache
        const now = Date.now();
        if (cache && now - lastFetchedTime < 2 * 60 * 1000) {
            return res.json(cache);
        }

        const browser = await getBrowserInstance();
        const page = await browser.newPage();

        await page.authenticate({
            username: 'report',
            password: 'K1CRvBnqJPC9'
        });

        await page.goto('https://reporting.handwrytten.com/performance', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('g.trace text.number');
        const numbers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('g.trace text.number')).map(el => el.textContent.trim())
        );

        await page.close();

        // save cache and timestamp
        cache = numbers;
        lastFetchedTime = Date.now();

        res.json(numbers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to scrape data' });
    }
});

// SCRAPE 192.168.0.91/jobs
app.get('/api/scrape-jobs', async (req, res) => {
    const machine = req.query.machine; // get machine number from parameter

    if (!machine || isNaN(machine) || machine < 71 || machine > 110) {
        return res.status(400).json({ error: 'Invalid machine number (71-110).' });
    }

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
        const jobPageUrl = `http://192.168.0.${machine}/jobs`;
        await page.goto(jobPageUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });

        await page.waitForSelector('tbody tr', { timeout: 15000 });

        const extractedData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tbody tr'));

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
                        dataRows: [] // initialize an empty array for its rows
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
