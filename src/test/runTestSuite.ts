import * as fs from 'node:fs';
import * as path from 'node:path';

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

type TestModule = {
  tests?: TestCase[];
};

export async function run(): Promise<void> {
  const testDir = __dirname;
  const testFiles = fs
    .readdirSync(testDir)
    .filter((file) => file.endsWith('.test.js'))
    .sort();

  let failures = 0;

  for (const file of testFiles) {
    const modulePath = path.join(testDir, file);
    const loaded = (await import(modulePath)) as TestModule;
    const tests = loaded.tests ?? [];

    for (const testCase of tests) {
      try {
        await testCase.run();
        console.log(`PASS ${file} :: ${testCase.name}`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL ${file} :: ${testCase.name}`);
        console.error(error);
      }
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} extension test(s) failed`);
  }
}