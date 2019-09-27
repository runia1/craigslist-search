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

(async () => {
    const browser = await puppeteer.launch({
        //headless: false
    });

    const cityLinks = require('./cityLinks');

    // we can't open 400+ tabs at once, so we need to split this into batches
    const cityLinkBatches = [];
    while (cityLinks.length > 0) {
        cityLinkBatches.push(cityLinks.splice(0, 50));
    }

    let postsOfInterest = [];
    for (const cityLinks of cityLinkBatches) {
        const postsByCities = await Promise.all(cityLinks.map(async cityLink => {
            const page = await browser.newPage();
            let link = '';
            if (cityLink.indexOf('//') === 0) {
                // pull the 3 char code off the end
                const code = cityLink.substr(cityLink.length - 4, 3);
                const realCityLink = cityLink.substring(0, cityLink.length - 4);
                link = `https:${realCityLink}/search/${code}/ava`
            } else {
                link = `${cityLink}/search/ava`;
            }

            // TODO: make search terms and category a variable
            link += '?query=kitfox';

            await page.goto(link);
            const postLinks = await page.evaluate(
                () => Array.from(
                    document.querySelectorAll('li[class="result-row"]>a'),
                    a => a.getAttribute('href')
                )
            );
            await page.close();
            return postLinks;
        }));

        // reduce the result of map down into a single array
        const posts = postsByCities.reduce((accumulator, postsByCity) => {
            return [...accumulator, ...postsByCity];
        }, []);

        postsOfInterest.push(...posts);
        console.debug('done processing batch');
    }

    browser.close();

    // filter out the duplicates
    postsOfInterest = [...new Set(postsOfInterest)];

    console.log(postsOfInterest);
})();

