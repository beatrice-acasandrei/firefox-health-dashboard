import fetchJson from '../fetch/json';
import browserslist from 'browserslist';
import { flow, map, sortBy, toPairs, some, filter, find, reverse } from 'lodash/fp';
import caniuse from 'caniuse-db/data.json';
import resolveCategory from '../meta/feature-category';

const firefoxBase = 'https://platform-status.mozilla.org/api/status';

export async function getInDevelopment() {
  const firefoxStatus = await fetchJson(firefoxBase);
  const latest = browserslist.queries.lastVersions.select(1)
    .reduce((result, str) => {
      const [platform, version] = str.split(/\s+/);
      result[platform] = +version;
      return result;
    }, {});
  return flow(
    toPairs,
    map(([ref, feature]) => {
      const result = {
        id: ref,
        name: feature.title,
        category: resolveCategory(feature.categories.join(' ')),
        link: `http://caniuse.com/#feat=${ref}`,
        caniuse: {
          ref: ref,
          usage: feature.usage_perc_y + feature.usage_perc_a,
        },
        completeness: 0,
        recency: 0,
      };
      ['firefox', 'chrome', 'ie', 'safari'].forEach((platform) => {
        result[platform] = { status: 'nope' };
        const versions = feature.stats[platform];
        const recencyFactor = /firefox|chrome/.test(platform) ? 2 : 0;
        flow(
          toPairs,
          sortBy(([idx]) => parseFloat(idx)),
          reverse,
          some(([idx, state]) => {
            if (!result[platform].alt) {
              result[platform].alt = state;
            }
            const version = parseFloat(idx);
            if (/[ay]/.test(state) && version <= latest[platform]) {
              result[platform].status = 'shipped';
              result[platform].version = version;
              return true;
            }
            if (/[ayd]/.test(state)) {
              result[platform].status = 'in-development';
              result[platform].version = version;
            }
            return false;
          })
        )(versions);
        switch (result[platform].status) {
          case 'shipped':
            if (latest[platform] - result[platform].version <= recencyFactor) {
              result.recency += 1;
            }
            result.completeness += 1;
            break;
          case 'in-development':
            result.recency += result[platform].version > latest[platform] ? 1 : 0;
            result.completeness += 0.5;
            break;
          default:
        }
      });
      const firefoxRef = find({ caniuse_ref: ref })(firefoxStatus);
      if (firefoxRef) {
        result.firefox.ref = firefoxRef.slug;
      }
      return result;
    }),
    filter(({ completeness }) => completeness < 4 && completeness >= 0.5)
    // filter(({ recency }) => recency >= 0.5)
  )(caniuse.data);
}