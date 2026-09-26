// Executable entry: the release bundle runs this file; tests import main.ts.
import { main } from './main.ts';

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
