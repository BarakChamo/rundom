//! Canonical arena topology for the independently testable Rust storage track.

/// A slot in one tree. IDs must only be used with the tree that issued them.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NodeId(usize);

impl NodeId {
    /// Returns this tree-local slot for parallel payload arenas and bulk serialization.
    pub fn index(self) -> usize {
        self.0
    }
}

/// Why the requested topology operation could not be performed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TreeError {
    /// The ID does not address an allocated slot.
    UnknownNode(NodeId),
    /// The requested parent is the child itself or one of its descendants.
    Cycle,
    /// Insertion before a sibling requires that sibling to have a parent.
    DetachedAnchor,
}

#[derive(Default)]
struct Node {
    parent: Option<NodeId>,
    children: Vec<NodeId>,
}

/// An ordered forest with stable slots and one parent per node.
#[derive(Default)]
pub struct Tree {
    nodes: Vec<Node>,
}

impl Tree {
    /// Allocates a detached node whose ID remains valid for the lifetime of this tree.
    pub fn create_node(&mut self) -> NodeId {
        let id = NodeId(self.nodes.len());
        self.nodes.push(Node::default());
        id
    }

    /// Returns the current parent or `None` for a detached node.
    pub fn parent(&self, id: NodeId) -> Result<Option<NodeId>, TreeError> {
        Ok(self.node(id)?.parent)
    }

    /// Borrows the current children in insertion order.
    pub fn children(&self, id: NodeId) -> Result<&[NodeId], TreeError> {
        Ok(&self.node(id)?.children)
    }

    /// Moves a node to the end of a parent's children. Invalid moves leave the tree intact.
    pub fn append(&mut self, parent: NodeId, child: NodeId) -> Result<(), TreeError> {
        self.check_move(parent, child)?;
        self.detach(child)?;
        self.nodes[parent.0].children.push(child);
        self.nodes[child.0].parent = Some(parent);
        Ok(())
    }

    /// Moves a node before a parented sibling; invalid moves leave every edge intact.
    pub fn insert_before(&mut self, sibling: NodeId, child: NodeId) -> Result<(), TreeError> {
        let parent = self.parent(sibling)?.ok_or(TreeError::DetachedAnchor)?;
        self.check_move(parent, child)?;
        if sibling == child {
            return Ok(());
        }
        self.detach(child)?;
        let siblings = &mut self.nodes[parent.0].children;
        let Some(index) = siblings.iter().position(|id| *id == sibling) else {
            unreachable!("a parented insertion anchor must have a reciprocal edge");
        };
        siblings.insert(index, child);
        self.nodes[child.0].parent = Some(parent);
        Ok(())
    }

    /// Detaches an allocated node. Repeated detachment succeeds without changing other nodes.
    pub fn detach(&mut self, child: NodeId) -> Result<(), TreeError> {
        if let Some(previous) = self.parent(child)? {
            let siblings = &mut self.nodes[previous.0].children;
            let Some(index) = siblings.iter().position(|id| *id == child) else {
                unreachable!("a child's parent must contain its reciprocal edge");
            };
            siblings.remove(index);
        }
        self.nodes[child.0].parent = None;
        Ok(())
    }

    fn check_move(&self, parent: NodeId, child: NodeId) -> Result<(), TreeError> {
        self.node(child)?;
        let mut cursor = Some(parent);
        // An existing parent path cannot exceed the number of allocated nodes.
        while let Some(id) = cursor {
            cursor = self.parent(id)?;
            if id == child {
                return Err(TreeError::Cycle);
            }
        }
        Ok(())
    }

    fn node(&self, id: NodeId) -> Result<&Node, TreeError> {
        self.nodes.get(id.0).ok_or(TreeError::UnknownNode(id))
    }
}
