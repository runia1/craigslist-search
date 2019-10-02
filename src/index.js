const puppeteer = require('puppeteer');

async function getCityLinks() {
    const browser = await puppeteer.launch({
        //headless: false
    });
    const page = await browser.newPage();
    await page.goto('https://craigslist.org');
    const stateLinks = await page.evaluate(
        () => Array.from(
            document.querySelectorAll('a[href*="//geo.craigslist.org/iso/us"]'),
            a => a.getAttribute('href')
        )
    );
    await page.close();

    const cityLinksForStates = await Promise.all(stateLinks.map(async stateLink => {
        const page = await browser.newPage();
        await page.goto(`https:${stateLink}`);
        const stateCityLinks = await page.evaluate(
            () => Array.from(
                document.querySelectorAll('ul[class*="geo-site-list"]>li>a[href*="craigslist.org"]'),
                a => a.getAttribute('href')
            )
        );

        if (stateCityLinks.length === 0) {
            console.log('found 0 cities??? for state link: ', stateLink);
        }

        await page.close();
        return stateCityLinks;
    }));
    browser.close();

    // flatten the arrays into one array
    return cityLinksForStates.reduce((accumulator, cityLinksForState) => {
        return [...accumulator, ...cityLinksForState];
    }, []);
}

function uniqueResults(results, newResults) {
    return newResults.filter(result => !results.includes(result));
}

async function getResultsFromCity(page, cityLink, category, searchQuery) {
    try {
        let link = '';
        if (cityLink.indexOf('//') === 0) {
            // pull the 3 char code off the end
            const code = cityLink.substr(cityLink.length - 4, 3);
            const realCityLink = cityLink.substring(0, cityLink.length - 4);
            link = `https:${realCityLink}/search/${code}/${category}`
        } else {
            link = `${cityLink}/search/${category}`;
        }

        link += `?query=${searchQuery}`;

        try {
            await page.goto(link);
            return await page.evaluate(
                () => Array.from(
                    document.querySelectorAll('li[class="result-row"]>a'),
                    a => a.getAttribute('href')
                )
            );
        }
        catch (error) {
            console.error(error.message);
            console.error(link);
        }
    } catch (error) {
        console.error(error.message);
    }
}

(async () => {
    const category = 'ava';
    const searchQuery = 'kitfox';

    const browser = await puppeteer.launch({
        //headless: false
    });

    const allCityLinks = require('./cityLinks');

    // we can't open 400+ tabs at once, but we can open a substantial amount in parallel, so we
    // create an initial set and use it sort of like a queue
    const queue = allCityLinks.splice(0, 50);

    let postsOfInterest = [];
    await Promise.all(queue.map(async cityLink => {
        try {
            const page = await browser.newPage();

            do {
                const foundResults = await getResultsFromCity(page, cityLink, category, searchQuery);
                const newResults = uniqueResults(postsOfInterest, foundResults);
                console.log(`found these new unique results ${newResults}`);
                postsOfInterest = postsOfInterest.concat(newResults);
                cityLink = allCityLinks.splice(0, 1)[0];
            } while (cityLink !== undefined);

            await page.close();
        } catch (err) {
            console.error(err);
        }
    }));

    browser.close();

    console.log(`found all ${postsOfInterest}`);
})();
