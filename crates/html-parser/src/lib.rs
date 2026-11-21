//! HTML5 tree construction over canonical Rust topology, exported through one compact Node-API call.
mod arena;
mod transport;

use html5ever::{parse_document, tendril::TendrilSink};
use napi_derive::napi;
pub use transport::CompactSnapshot;

/// Parses inactive HTML into compact transport version two; malformed HTML recovers normally.
/// Snapshots exceeding the transport's integer range report Node-API InvalidArg.
#[napi]
pub fn parse_document_snapshot(
    markup: String,
    scripting_enabled: bool,
) -> napi::Result<CompactSnapshot> {
    let mut options = html5ever::ParseOpts::default();
    options.tree_builder.scripting_enabled = scripting_enabled;
    let snapshot = parse_document(arena::Arena::default(), options).one(markup);
    transport::encode(snapshot).map_err(Into::into)
}
