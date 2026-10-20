# Background processing status

FaultLens currently performs generation, prompt evaluation, and alert evaluation synchronously through the API. A queue worker is not part of the MVP. Background evaluation, scheduled alerts, retries, dead-letter handling, and notification delivery are postponed until a concrete asynchronous workload requires them.
