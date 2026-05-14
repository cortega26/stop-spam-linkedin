# Security Policy

LinkedIn Spam Blocker runs locally in the browser and does not send browsing data, LinkedIn content, analytics, or telemetry to external services.

## Reporting a Vulnerability

Please report security issues privately by emailing the maintainer or, if private contact is unavailable, by opening a GitHub issue with a minimal description and no exploit details.

Include:

- Affected version
- Browser and operating system
- Steps to reproduce
- Potential impact
- Suggested fix, if known

Please do not publicly disclose exploit details until there has been a reasonable opportunity to investigate and release a fix.

## Scope

Security-relevant reports include:

- Data leaving the browser unexpectedly
- Overbroad permissions or host access
- Unsafe handling of imported settings
- Cross-site scripting or DOM injection risks
- Extension behavior that modifies LinkedIn account data

Out of scope:

- LinkedIn platform moderation decisions
- Spam patterns that are simply missed by the detector
- False positives without a security impact

