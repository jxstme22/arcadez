// harvest:status — read-only data inventory. See src/status.mjs.
import {loadEnv, config} from '../src/config.mjs';
import {statusReport} from '../src/status.mjs';
loadEnv();
console.log(JSON.stringify(statusReport(config()), null, 2));
