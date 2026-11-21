//! Encodes arena records as fixed-width integer sections and one deduplicated Unicode string pool.
use crate::arena::Snapshot;
use napi::{Status, bindgen_prelude::Uint32Array};
use napi_derive::napi;
use std::collections::HashMap;

const HEADER: usize = 8;
const NODE: usize = 12;
const ATTRIBUTE: usize = 7;
const ABSENT: u32 = u32::MAX;

/// Compact transport version two; storage is owned by the returned Node-API values.
#[napi(object)]
pub struct CompactSnapshot {
    /// Header, fixed-width node records, child slots and attribute records, in that order.
    pub words: Uint32Array,
    /// Deduplicated string storage addressed in UTF-16 code units by each span.
    pub strings: String,
}

#[derive(Debug)]
pub(crate) struct SnapshotTooLarge;

fn word(value: usize) -> Result<u32, SnapshotTooLarge> {
    u32::try_from(value).map_err(|_| SnapshotTooLarge)
}

#[derive(Default)]
struct StringPool<'a> {
    text: String,
    length: usize,
    spans: HashMap<&'a str, [u32; 2]>,
}

impl<'a> StringPool<'a> {
    fn span(&mut self, value: &'a str) -> Result<[u32; 2], SnapshotTooLarge> {
        if value.is_empty() {
            return Ok([0, 0]);
        }
        if let Some(span) = self.spans.get(value) {
            return Ok(*span);
        }
        let length = value.encode_utf16().count();
        let span = [word(self.length)?, word(length)?];
        self.length = self.length.checked_add(length).ok_or(SnapshotTooLarge)?;
        word(self.length)?;
        self.text.push_str(value);
        self.spans.insert(value, span);
        Ok(span)
    }
}

fn namespace(value: &str) -> u32 {
    match value {
        "" => 0,
        "http://www.w3.org/1999/xhtml" => 1,
        "http://www.w3.org/2000/svg" => 2,
        "http://www.w3.org/1998/Math/MathML" => 3,
        "http://www.w3.org/1999/xlink" => 4,
        "http://www.w3.org/XML/1998/namespace" => 5,
        "http://www.w3.org/2000/xmlns/" => 6,
        other => panic!("HTML parser emitted unsupported namespace {other}"),
    }
}

/// Encodes all finite arena sections without serializing or allocating JavaScript records.
pub(crate) fn encode(snapshot: Snapshot) -> Result<CompactSnapshot, SnapshotTooLarge> {
    assert_eq!(snapshot.version, 1, "arena snapshot version is canonical");
    let child_count: usize = snapshot.nodes.iter().map(|node| node.children.len()).sum();
    let attribute_count: usize = snapshot.nodes.iter().map(|node| node.attrs.len()).sum();
    let mode = match snapshot.mode {
        "no-quirks" => 0,
        "quirks" => 1,
        "limited-quirks" => 2,
        _ => unreachable!("parser mode is canonical"),
    };
    let capacity = HEADER
        .checked_add(
            NODE.checked_mul(snapshot.nodes.len())
                .ok_or(SnapshotTooLarge)?,
        )
        .and_then(|value| value.checked_add(child_count))
        .and_then(|value| value.checked_add(ATTRIBUTE.checked_mul(attribute_count)?))
        .ok_or(SnapshotTooLarge)?;
    word(capacity)?;
    let mut words = Vec::with_capacity(capacity);
    words.extend([
        0x52444f4d,
        2,
        word(snapshot.nodes.len())?,
        mode,
        word(child_count)?,
        word(attribute_count)?,
        0,
        0,
    ]);
    let mut pool = StringPool::default();
    let mut child_start = 0;
    let mut attribute_start = 0;
    for node in &snapshot.nodes {
        let kind = match node.kind {
            "document" => 0,
            "fragment" => 1,
            "element" => 2,
            "text" => 3,
            "comment" => 4,
            "doctype" => 5,
            _ => unreachable!("parser node kind is canonical"),
        };
        words.extend([kind, namespace(&node.namespace)]);
        words.extend(pool.span(&node.name)?);
        words.extend(pool.span(&node.text)?);
        if node.kind == "doctype" {
            // Leaf doctypes reuse ownership fields for their two identifier spans.
            words.extend(pool.span(&node.public_id)?);
            words.extend(pool.span(&node.system_id)?);
        } else {
            words.extend([
                word(child_start)?,
                word(node.children.len())?,
                word(attribute_start)?,
                word(node.attrs.len())?,
            ]);
        }
        words.extend([
            node.template.map(word).transpose()?.unwrap_or(ABSENT),
            node.form.map(word).transpose()?.unwrap_or(ABSENT),
        ]);
        child_start += node.children.len();
        attribute_start += node.attrs.len();
    }
    for node in &snapshot.nodes {
        for child in &node.children {
            words.push(word(*child)?);
        }
    }
    for node in &snapshot.nodes {
        for attr in &node.attrs {
            words.extend(pool.span(attr.name.local.as_ref())?);
            words.extend(pool.span(attr.value.as_ref())?);
            words.push(namespace(attr.name.ns.as_ref()));
            words.extend(
                pool.span(
                    attr.name
                        .prefix
                        .as_ref()
                        .map_or("", |prefix| prefix.as_ref()),
                )?,
            );
        }
    }
    words[6] = word(pool.length)?;
    assert_eq!(
        words.len(),
        capacity,
        "compact sections fill their exact allocated bounds"
    );
    Ok(CompactSnapshot {
        words: Uint32Array::new(words),
        strings: pool.text,
    })
}

impl From<SnapshotTooLarge> for napi::Error {
    fn from(_: SnapshotTooLarge) -> Self {
        napi::Error::new(
            Status::InvalidArg,
            "HTML snapshot exceeds compact transport bounds",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_out_of_range_indices_and_counts() {
        assert!(word(u32::MAX as usize).is_ok());
        if usize::BITS > 32 {
            assert!(word(u32::MAX as usize + 1).is_err());
        }
    }
    #[test]
    fn interns_strings_with_utf16_offsets() -> Result<(), SnapshotTooLarge> {
        let mut pool = StringPool::default();
        assert_eq!(pool.span("😀")?, [0, 2]);
        assert_eq!(pool.span("text")?, [2, 4]);
        assert_eq!(pool.span("😀")?, [0, 2]);
        assert_eq!(pool.text, "😀text");
        Ok(())
    }
}
