import time


def call_with_retries(call, max_attempts=5, first_delay_s=0.1, max_delay_s=2.0):
    attempt = 1
    delay = first_delay_s
    while True:
        try:
            return call()
        except Exception:
            if attempt >= max_attempts:
                raise
            attempt += 1
            time.sleep(delay)
            delay = min(delay * 2, max_delay_s)
