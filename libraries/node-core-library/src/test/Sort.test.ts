// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Sort } from '../Sort';

test('Sort.compareByValue', () => {
  const array: number[] = [3, 6, 2];
  array.sort(Sort.compareByValue); // [2, 3, 6]
});

test('Sort.compareByValue cases', () => {
  const values: unknown[] = [undefined, null, -1, 1];
  const results: string[] = [];
  for (let i: number = 0; i < values.length; ++i) {
    for (let j: number = 0; j < values.length; ++j) {
      const x: unknown = values[i];
      const y: unknown = values[j];
      let relation: string = '?';
      switch (Sort.compareByValue(x, y)) {
        case -1:
          relation = '<';
          break;
        case 0:
          relation = '=';
          break;
        case 1:
          relation = '>';
          break;
      }
      results.push(`${x} ${relation} ${y}`);
    }
  }
  expect(results).toMatchSnapshot();
});

test('Sort.sortBy', () => {
  const array: string[] = ['aaa', 'bb', 'c'];
  Sort.sortBy(array, (x) => x.length); // [ 'c', 'bb', 'aaa' ]
});

test('Sort.isSortedBy', () => {
  const array: string[] = ['a', 'bb', 'ccc'];
  Sort.isSortedBy(array, (x) => x.length); // true
});

test('Sort.sortMapKeys', () => {
  const map: Map<string, number> = new Map<string, number>();
  map.set('zebra', 1);
  map.set('goose', 2);
  map.set('aardvark', 3);
  Sort.sortMapKeys(map);
  expect(Array.from(map.keys())).toEqual(['aardvark', 'goose', 'zebra']);
});

test('Sort.sortSetBy', () => {
  const set: Set<string> = new Set<string>();
  set.add('aaa');
  set.add('bb');
  set.add('c');
  Sort.sortSetBy(set, (x) => x.length);
  expect(Array.from(set)).toEqual(['c', 'bb', 'aaa']);
});

test('Sort.sortSet', () => {
  const set: Set<string> = new Set<string>();
  set.add('zebra');
  set.add('goose');
  set.add('aardvark');
  Sort.sortSet(set);
  expect(Array.from(set)).toEqual(['aardvark', 'goose', 'zebra']);
});

describe('Sort.sortKeys', () => {
  // Test cases from https://github.com/sindresorhus/sort-keys/blob/v4.2.0/test.js
  function deepEqualInOrder(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actual: Partial<Record<string, any>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expected: Partial<Record<string, any>>
  ): void {
    expect(actual).toEqual(expected);

    const seen = new Set();

    function assertSameKeysInOrder(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      object1: Partial<Record<string, any>>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      object2: Partial<Record<string, any>>
    ): void {
      // This function assumes the objects given are already deep equal.

      if (seen.has(object1) && seen.has(object2)) {
        return;
      }

      seen.add(object1);
      seen.add(object2);

      if (Array.isArray(object1)) {
        for (const index of object1.keys()) {
          assertSameKeysInOrder(object1[index], object2[index]);
        }
      } else if (typeof object1 === 'object') {
        const keys1 = Object.keys(object1);
        const keys2 = Object.keys(object2);
        expect(keys1).toEqual(keys2);
        for (const index of keys1.keys()) {
          assertSameKeysInOrder(object1[keys1[index]], object2[keys2[index]]);
        }
      }
    }

    assertSameKeysInOrder(actual, expected);
  }

  test('sort the keys of an object', () => {
    deepEqualInOrder(Sort.sortKeys({ c: 0, a: 0, b: 0 }), { a: 0, b: 0, c: 0 });
  });

  test('custom compare function', () => {
    const compare: (a: string, b: string) => number = (a: string, b: string) => b.localeCompare(a);
    deepEqualInOrder(Sort.sortKeys({ c: 0, a: 0, b: 0 }, { compare }), { c: 0, b: 0, a: 0 });
  });

  test('deep option', () => {
    deepEqualInOrder(Sort.sortKeys({ c: { c: 0, a: 0, b: 0 }, a: 0, b: 0 }, { deep: true }), {
      a: 0,
      b: 0,
      c: { a: 0, b: 0, c: 0 }
    });

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const object: Partial<Record<string, any>> = { a: 0 };
      object.circular = object;
      Sort.sortKeys(object, { deep: true });
    }).not.toThrow();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object: Partial<Record<string, any>> = { z: 0 };
    object.circular = object;
    const sortedObject = Sort.sortKeys(object, { deep: true });

    expect(sortedObject).toBe(sortedObject.circular);
    expect(Object.keys(sortedObject)).toEqual(['circular', 'z']);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object1: Partial<Record<string, any>> = { b: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object2: Partial<Record<string, any>> = { d: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object3: Partial<Record<string, any>> = { a: [{ b: 0 }] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object4: Partial<Record<string, any>> = { a: [{ d: 0 }] };

    object1.a = object2;
    object2.c = object1;
    object3.a[0].a = object4.a[0];
    object4.a[0].c = object3.a[0];

    expect(() => {
      Sort.sortKeys(object1, { deep: true });
      Sort.sortKeys(object2, { deep: true });
      Sort.sortKeys(object3, { deep: true });
      Sort.sortKeys(object4, { deep: true });
    }).not.toThrow();

    const sorted = Sort.sortKeys(object1, { deep: true });
    const deepSorted = Sort.sortKeys(object3, { deep: true });

    expect(sorted).toBe(sorted.a.c);
    deepEqualInOrder(deepSorted.a[0], deepSorted.a[0].a.c);
    expect(Object.keys(sorted)).toStrictEqual(['a', 'b']);
    expect(Object.keys(deepSorted.a[0])).toStrictEqual(['a', 'b']);
    deepEqualInOrder(
      Sort.sortKeys({ c: { c: 0, a: 0, b: 0 }, a: 0, b: 0, z: [9, 8, 7, 6, 5] }, { deep: true }),
      { a: 0, b: 0, c: { a: 0, b: 0, c: 0 }, z: [9, 8, 7, 6, 5] }
    );
    expect(Object.keys(Sort.sortKeys({ a: [{ b: 0, a: 0 }] }, { deep: true }).a[0])).toEqual(['a', 'b']);
  });

  test('deep arrays', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object: Partial<Record<string, any>> = {
      b: 0,
      a: [{ b: 0, a: 0 }, [{ b: 0, a: 0 }]]
    };
    object.a.push(object);
    object.a[1].push(object.a[1]);

    expect(() => {
      Sort.sortKeys(object, { deep: true });
    }).not.toThrow();

    const sorted = Sort.sortKeys(object, { deep: true });
    // Cannot use .toBe() as Jest will encounter https://github.com/jestjs/jest/issues/10577
    expect(sorted.a[2] === sorted).toBeTruthy();
    expect(sorted.a[1][1] === sorted.a[1]).toBeTruthy();
    expect(Object.keys(sorted)).toEqual(['a', 'b']);
    expect(Object.keys(sorted.a[0])).toEqual(['a', 'b']);
    expect(Object.keys(sorted.a[1][0])).toEqual(['a', 'b']);
  });

  test('top-level array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const array: Array<any> = [
      { b: 0, a: 0 },
      { c: 0, d: 0 }
    ];
    const sorted = Sort.sortKeys(array);
    expect(sorted).not.toBe(array);
    expect(sorted[0]).toBe(array[0]);
    expect(sorted[1]).toBe(array[1]);

    const deepSorted = Sort.sortKeys(array, { deep: true });
    expect(deepSorted).not.toBe(array);
    expect(deepSorted[0]).not.toBe(array[0]);
    expect(deepSorted[1]).not.toBe(array[1]);
    expect(Object.keys(deepSorted[0])).toEqual(['a', 'b']);
    expect(Object.keys(deepSorted[1])).toEqual(['c', 'd']);
  });

  test('keeps property descriptors intact', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const descriptors: Partial<Record<string, any>> = {
      b: {
        value: 1,
        configurable: true,
        enumerable: true,
        writable: false
      },
      a: {
        value: 2,
        configurable: false,
        enumerable: true,
        writable: true
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const object: Partial<Record<string, any>> = {};
    Object.defineProperties(object, descriptors);

    const sorted = Sort.sortKeys(object);

    deepEqualInOrder(sorted, { a: 2, b: 1 });
    expect(Object.getOwnPropertyDescriptors(sorted)).toEqual(descriptors);
  });
});
