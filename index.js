const request = require('client-request/promise');
const cheerio = require('cheerio');
const memoize = require('memoize-fs')({ cachePath: '.cache' });
const pmap = (arr, fn) => require('p-map')(arr, fn, { concurrency: 5 });
const fs = require('fs');

const numberOfPages = 17;

async function main() {
  const fetch = await memoize.fn(url => request({ url }).then(_ => _.body.toString()).catch(error => { throw `Couldn't fetch url "${url}". ${error.message}` }));

  const links = (await pmap(Array.from(Array(numberOfPages)), async(_, i) => {
    i += 1;

    const html = await fetch(`http://fitgirl-repacks.site/all-my-repacks-a-z/?lcp_page0=${i+1}#lcp_instance_0`);
    const $ = cheerio.load(html);

    const links = Array.from($('ul#lcp_instance_0 li a'))
      .map(a => a.attribs.href);

    // console.log(`${i}: ${links.length} links`);
    return links;
  })).reduce((a, b) => a.concat(b));

  // console.log(links);

  const data = await pmap(links, async link => {
    try {
      const html = await fetch(link);
      const $ = cheerio.load(html);

      const data = { link };

      data.title = $('.entry-title').text();
      data.entryDate = (new Date($('time.entry-date').attr('datetime'))).toISOString().split('T')[0];
      data.comments = parseInt($('.comments-link a').text());


      const entryContent = $('.entry-content').text();

      data.genres = (entryContent.match(/genres\/tags:(.*?)\n/i) || ['', ''])[1].trim();
      data.companies = (entryContent.match(/companies:(.*?)\n/i) || ['', ''])[1].trim();
      data.languages = (entryContent.match(/languages:(.*?)\n/i) || ['', ''])[1].trim();
      data.originalSize = fixSize((entryContent.match(/original size:(.*?[GM]B)/i) || [])[1]);
      data.repackSize = fixSize((entryContent.match(/repack size:(.*?[GM]B)/i) || [])[1]);
      data.repackRatio = parseFloat((data.repackSize / data.originalSize).toFixed(2));

      return data;

    } catch (error) {
      console.error('Error parsing link:', link, error);
      return {}
      // throw error;
    }
  });

  // console.log(data);

  fs.writeFileSync('data.json', JSON.stringify(data));

  const csvHeader = 'title,link,entryDate,comments,genres,companies,languages,originalSize,repackSize,repackRatio'.split(/,/g);
  const extractForCsv = data => csvHeader.reduce((p, c) => p + removeCommas(data[c]) + ',', '');
  let csv = csvHeader.join(',');
  for (const _ of data) {
    csv += '\n' + extractForCsv(_)
  }
  fs.writeFileSync('data.csv', csv);

};


function fixSize(str) {
  const numbers = (str.match(/([0-9]+)[.,]?([0-9]+)?/) || []).slice(1);
  let number = parseInt(numbers[0]) + parseFloat('.' + (numbers[1] || 0));
  const multiplier = str.match(/gb/i) ? 1024 : 1;
  number *= multiplier;
  number = parseInt(number);

  return number;
}

function removeCommas(str) {
  try {
    return (str || '').replace(/,/g, ' ');
  } catch (error) {
    // console.error({str});
    // console.error(error);
    return str
  }
}

main().catch(console.error);
