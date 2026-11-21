//! Adapts html5ever's tree builder to stable arena slots and a versioned bulk snapshot.
use html5ever::{
    Attribute, ExpandedName, Namespace, QualName,
    interface::{ElementFlags, NodeOrText, QuirksMode, TreeSink},
    tendril::StrTendril,
};
use run_dom_core::{NodeId, Tree, TreeError};
use std::{borrow::Cow, cell::RefCell};

#[derive(Clone)]
pub(crate) struct Handle {
    id: NodeId,
    name: Option<QualName>,
    integration_point: bool,
}

pub(crate) struct Snapshot {
    pub(crate) version: u8,
    pub(crate) mode: &'static str,
    pub(crate) nodes: Vec<Record>,
}

pub(crate) struct Record {
    pub(crate) kind: &'static str,
    pub(crate) name: StrTendril,
    pub(crate) namespace: Namespace,
    pub(crate) text: StrTendril,
    pub(crate) public_id: StrTendril,
    pub(crate) system_id: StrTendril,
    pub(crate) attrs: Vec<Attribute>,
    pub(crate) children: Vec<usize>,
    pub(crate) template: Option<usize>,
    pub(crate) form: Option<usize>,
}

impl Record {
    fn new(kind: &'static str) -> Self {
        Self {
            kind,
            name: StrTendril::new(),
            namespace: Namespace::default(),
            text: StrTendril::new(),
            public_id: StrTendril::new(),
            system_id: StrTendril::new(),
            attrs: Vec::new(),
            children: Vec::new(),
            template: None,
            form: None,
        }
    }
}

struct State {
    tree: Tree,
    handles: Vec<Handle>,
    records: Vec<Record>,
    mode: &'static str,
}

impl State {
    fn allocate(
        &mut self,
        record: Record,
        name: Option<QualName>,
        integration_point: bool,
    ) -> Handle {
        let id = self.tree.create_node();
        assert_eq!(
            id.index(),
            self.records.len(),
            "topology and payload slots agree"
        );
        let handle = Handle {
            id,
            name,
            integration_point,
        };
        self.records.push(record);
        self.handles.push(handle.clone());
        handle
    }

    fn insert(&mut self, parent: NodeId, before: Option<NodeId>, child: NodeOrText<Handle>) {
        let id = match child {
            NodeOrText::AppendNode(handle) => handle.id,
            NodeOrText::AppendText(text) => {
                if text.is_empty() {
                    return;
                }
                let siblings = invariant(self.tree.children(parent));
                let end = before.map_or(siblings.len(), |anchor| {
                    let Some(index) = siblings.iter().position(|id| *id == anchor) else {
                        unreachable!("insertion anchor belongs to its parent");
                    };
                    index
                });
                if end > 0 {
                    let preceding = siblings[end - 1];
                    let record = &mut self.records[preceding.index()];
                    if record.kind == "text" {
                        record.text.push_tendril(&text);
                        return;
                    }
                }
                let mut record = Record::new("text");
                record.text = text;
                self.allocate(record, None, false).id
            }
        };
        if let Some(anchor) = before {
            invariant(self.tree.insert_before(anchor, id));
        } else {
            invariant(self.tree.append(parent, id));
        }
    }
}

fn invariant<T>(value: Result<T, TreeError>) -> T {
    match value {
        Ok(value) => value,
        Err(error) => panic!("html5ever issued invalid arena topology: {error:?}"),
    }
}

pub(crate) struct Arena(RefCell<State>);

impl Default for Arena {
    fn default() -> Self {
        let mut state = State {
            tree: Tree::default(),
            handles: Vec::new(),
            records: Vec::new(),
            mode: "no-quirks",
        };
        state.allocate(Record::new("document"), None, false);
        Self(RefCell::new(state))
    }
}

impl TreeSink for Arena {
    type Handle = Handle;
    type Output = Snapshot;
    type ElemName<'a> = ExpandedName<'a>;

    fn finish(self) -> Snapshot {
        let mut state = self.0.into_inner();
        for (index, record) in state.records.iter_mut().enumerate() {
            record.children = invariant(state.tree.children(state.handles[index].id))
                .iter()
                .map(|id| id.index())
                .collect();
        }
        Snapshot {
            version: 1,
            mode: state.mode,
            nodes: state.records,
        }
    }

    fn parse_error(&self, _msg: Cow<'static, str>) {
        // HTML parse errors are recoverable syntax, not transport failures.
    }

    fn get_document(&self) -> Handle {
        self.0.borrow().handles[0].clone()
    }

    fn elem_name<'a>(&'a self, target: &'a Handle) -> ExpandedName<'a> {
        let Some(name) = &target.name else {
            unreachable!("html5ever requests element names only for element handles");
        };
        name.expanded()
    }

    fn create_element(&self, name: QualName, attrs: Vec<Attribute>, flags: ElementFlags) -> Handle {
        let mut state = self.0.borrow_mut();
        let mut record = Record::new("element");
        // Keep html5ever's inline/shared tendrils and interned namespace/attribute atoms
        // until the one compact encoding pass; no per-field String copy is required.
        record.name = StrTendril::from(name.local.as_ref());
        record.namespace = name.ns.clone();
        record.attrs = attrs;
        if flags.template {
            record.template = Some(
                state
                    .allocate(Record::new("fragment"), None, false)
                    .id
                    .index(),
            );
        }
        state.allocate(
            record,
            Some(name),
            flags.mathml_annotation_xml_integration_point,
        )
    }

    fn create_comment(&self, text: StrTendril) -> Handle {
        let mut record = Record::new("comment");
        record.text = text;
        self.0.borrow_mut().allocate(record, None, false)
    }

    fn create_pi(&self, _target: StrTendril, _data: StrTendril) -> Handle {
        unreachable!("the HTML tree builder emits comments rather than processing instructions")
    }

    fn append(&self, parent: &Handle, child: NodeOrText<Handle>) {
        self.0.borrow_mut().insert(parent.id, None, child);
    }

    fn append_based_on_parent_node(
        &self,
        element: &Handle,
        previous: &Handle,
        child: NodeOrText<Handle>,
    ) {
        let mut state = self.0.borrow_mut();
        if let Some(parent) = invariant(state.tree.parent(element.id)) {
            state.insert(parent, Some(element.id), child);
        } else {
            state.insert(previous.id, None, child);
        }
    }

    fn append_doctype_to_document(&self, name: StrTendril, public: StrTendril, system: StrTendril) {
        let mut state = self.0.borrow_mut();
        let mut record = Record::new("doctype");
        record.name = name;
        record.public_id = public;
        record.system_id = system;
        let node = state.allocate(record, None, false);
        let root = state.handles[0].id;
        invariant(state.tree.append(root, node.id));
    }

    fn get_template_contents(&self, target: &Handle) -> Handle {
        let state = self.0.borrow();
        let Some(index) = state.records[target.id.index()].template else {
            unreachable!("template contents are requested only for template elements");
        };
        state.handles[index].clone()
    }

    fn same_node(&self, a: &Handle, b: &Handle) -> bool {
        a.id == b.id
    }

    fn set_quirks_mode(&self, mode: QuirksMode) {
        self.0.borrow_mut().mode = match mode {
            QuirksMode::Quirks => "quirks",
            QuirksMode::LimitedQuirks => "limited-quirks",
            QuirksMode::NoQuirks => "no-quirks",
        };
    }

    fn append_before_sibling(&self, sibling: &Handle, child: NodeOrText<Handle>) {
        let mut state = self.0.borrow_mut();
        let Some(parent) = invariant(state.tree.parent(sibling.id)) else {
            unreachable!("foster-parent insertion requires a parented sibling");
        };
        state.insert(parent, Some(sibling.id), child);
    }

    fn add_attrs_if_missing(&self, target: &Handle, attrs: Vec<Attribute>) {
        let mut state = self.0.borrow_mut();
        let existing = &mut state.records[target.id.index()].attrs;
        for attr in attrs {
            if !existing
                .iter()
                .any(|old| old.name.local == attr.name.local && old.name.ns == attr.name.ns)
            {
                existing.push(attr);
            }
        }
    }

    fn remove_from_parent(&self, target: &Handle) {
        invariant(self.0.borrow_mut().tree.detach(target.id));
    }

    fn reparent_children(&self, node: &Handle, parent: &Handle) {
        let mut state = self.0.borrow_mut();
        let children = invariant(state.tree.children(node.id)).to_vec();
        for child in children {
            invariant(state.tree.append(parent.id, child));
        }
    }

    fn associate_with_form(
        &self,
        target: &Handle,
        form: &Handle,
        _nodes: (&Handle, Option<&Handle>),
    ) {
        self.0.borrow_mut().records[target.id.index()].form = Some(form.id.index());
    }

    fn is_mathml_annotation_xml_integration_point(&self, target: &Handle) -> bool {
        target.integration_point
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use html5ever::{parse_document, tendril::TendrilSink};

    #[test]
    fn preserves_unicode_text_and_qualified_attribute_storage() {
        // Given: entities split text tokens and namespaced attributes carry interned names.
        let snapshot = parse_document(Arena::default(), Default::default())
            .one("<svg><a xlink:href='😀&amp;value'>left&amp;右😀</a></svg>");
        // When/Then: native-owned storage survives token consumption without losing qualification.
        let link = snapshot.nodes.iter().find(|node| node.name.as_ref() == "a");
        assert!(link.is_some(), "parsed SVG must contain its anchor");
        let link = match link {
            Some(link) => link,
            None => unreachable!(),
        };
        assert_eq!(&*link.namespace, "http://www.w3.org/2000/svg");
        assert_eq!(link.attrs.len(), 1);
        assert_eq!(link.attrs[0].value.as_ref(), "😀&value");
        assert_eq!(&*link.attrs[0].name.ns, "http://www.w3.org/1999/xlink");
        assert_eq!(
            link.attrs[0]
                .name
                .prefix
                .as_ref()
                .map(|value| value.as_ref()),
            Some("xlink")
        );
        assert!(
            snapshot
                .nodes
                .iter()
                .any(|node| node.text.as_ref() == "left&右😀")
        );
    }

    #[test]
    fn merges_missing_body_attributes_without_replacing_existing_values() {
        // Given: recovery can append attributes from a later body token to an existing node.
        let snapshot = parse_document(Arena::default(), Default::default())
            .one("<body id='first'><body class='second' id='ignored'>text");
        // When/Then: duplicate expanded names preserve the first value and new names are retained.
        let body = snapshot
            .nodes
            .iter()
            .find(|node| node.name.as_ref() == "body");
        let body = match body {
            Some(body) => body,
            None => panic!("parsed HTML must have a body"),
        };
        assert_eq!(body.attrs.len(), 2);
        assert!(
            body.attrs
                .iter()
                .any(|attr| &*attr.name.local == "id" && attr.value.as_ref() == "first")
        );
        assert!(
            body.attrs
                .iter()
                .any(|attr| &*attr.name.local == "class" && attr.value.as_ref() == "second")
        );
    }
}
