# @openstyle/adapter

Capability negotiation shared by renderer and compiler adapters.

Every capability is declared as `native`, `emulated`, or `unsupported`.
Missing declarations are unsupported, so adapters never silently discard
OpenStyle semantics.
