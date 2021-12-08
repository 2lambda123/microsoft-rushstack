import { string1, string2 } from './strings3.loc.json';
const strings4: string = require('./strings4.loc.json');

console.log(string1);
console.log(string2);

console.log(strings4);

import(/* webpackChunkName: 'chunk-with-strings' */ './chunks/chunkWithStrings').then(
  ({ ChunkWithStringsClass }) => {
    const chunk = new ChunkWithStringsClass();
    chunk.doStuff();
  }
);
