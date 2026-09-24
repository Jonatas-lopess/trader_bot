// The dummy robot-binary fixture — .scratch/robot-delivery/issues/01-download-token-schema-r2-scaffold.md:
// "a small dummy binary object uploaded into the test R2 bucket (miniflare)
// so tickets 02 and 03 have real bytes to mint links against and stream
// back." Real bytes (not a placeholder string treated as text), so a
// byte-for-byte comparison in ticket 03's end-to-end test is meaningful.
// `.ex5` is the compiled-binary extension MT5 Expert Advisors actually ship
// as (CONTEXT.md — the Robô is an MT5 Expert Advisor), used here as the
// filename tickets 02/03's streamed `Content-Disposition` carries.
export const ROBOT_BINARY_KEY = 'robo-trader.ex5';
export const ROBOT_BINARY_CONTENT_TYPE = 'application/octet-stream';
export const ROBOT_BINARY_BYTES = new TextEncoder().encode('ROBO-TRADER-EX5-FIXTURE-BINARY-PAYLOAD');
