# run-dom-core

An ordered Rust forest with stable arena slots. The library exports `Tree`, `NodeId`, and `TreeError`. An ID belongs to its issuing tree. Appending a child moves it to the new parent's tail. Invalid slots and cycles return typed errors before changing any edges.

| Command                                                              | Use                                         |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `cargo test --locked -p run-dom-core`                                | Verify topology, errors, and move ordering. |
| `cargo clippy --locked --all-targets -p run-dom-core -- -D warnings` | Check the library and its tests.            |
