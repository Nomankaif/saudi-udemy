# NetSim engine

Source: https://github.com/joxorsayan/netsim
Pinned commit: fb07a807f86f2daa64822b54239e3fcb53850693
License: MIT; see LICENSE. Copyright (c) 2025 Sayan Roy Chowdhury.

The engine directory is vendored unchanged. Platform integration and compatibility
behaviour live in ../../simulation/bridge.py. The upstream web application,
AI tutor frontend and hosting configuration are not used. No Python web service
or third-party Python packages are required for the integrated runtime.

Do not replace this version in place without regression tests and an attempt
version migration strategy. Existing labs without engine=netsim-v1 remain on
the original JavaScript engine.
