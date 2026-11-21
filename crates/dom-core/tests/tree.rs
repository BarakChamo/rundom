// Exercises the Rust storage boundary without a JavaScript bridge.
use run_dom_core::{Tree, TreeError};

#[test]
fn moves_an_existing_child_to_the_new_parents_tail() -> Result<(), TreeError> {
    // Given: one child under the old parent and a sibling under the new one.
    let mut tree = Tree::default();
    let old = tree.create_node();
    let new = tree.create_node();
    let child = tree.create_node();
    let sibling = tree.create_node();
    tree.append(old, child)?;
    tree.append(new, sibling)?;

    // When: the child moves to the new parent.
    tree.append(new, child)?;

    // Then: the old edge disappears and the new order and parent agree.
    assert_eq!(tree.children(old)?, &[]);
    assert_eq!(tree.children(new)?, &[sibling, child]);
    assert_eq!(tree.parent(child)?, Some(new));
    Ok(())
}

#[test]
fn rejects_cycles_before_touching_existing_edges() -> Result<(), TreeError> {
    // Given: a root and its child.
    let mut tree = Tree::default();
    let root = tree.create_node();
    let child = tree.create_node();
    tree.append(root, child)?;

    // When: the root would become its own descendant.
    assert_eq!(tree.append(child, root), Err(TreeError::Cycle));

    // Then: both directions still describe the original tree.
    assert_eq!(tree.children(root)?, &[child]);
    assert_eq!(tree.parent(child)?, Some(root));
    assert_eq!(tree.parent(root)?, None);
    Ok(())
}

#[test]
fn rejects_an_id_outside_the_current_arena() {
    // Given: an ID from a nonempty arena and a separate empty arena.
    let mut populated = Tree::default();
    let id = populated.create_node();
    let mut empty = Tree::default();

    // When and then: the empty arena rejects lookups and mutations for that slot.
    assert_eq!(empty.children(id), Err(TreeError::UnknownNode(id)));
    assert_eq!(empty.append(id, id), Err(TreeError::UnknownNode(id)));
}

#[test]
fn inserts_moves_and_detaches_without_losing_sibling_order() -> Result<(), TreeError> {
    // Given: three siblings and a separate parent used by parser foster parenting.
    let mut tree = Tree::default();
    let parent = tree.create_node();
    let other = tree.create_node();
    let a = tree.create_node();
    let b = tree.create_node();
    let c = tree.create_node();
    tree.append(parent, a)?;
    tree.append(parent, b)?;
    tree.append(parent, c)?;
    // When/Then: moving a sibling accounts for the index removed before insertion.
    tree.insert_before(c, a)?;
    assert_eq!(tree.children(parent)?, &[b, a, c]);
    tree.insert_before(b, c)?;
    assert_eq!(tree.children(parent)?, &[c, b, a]);
    tree.insert_before(b, b)?;
    assert_eq!(tree.children(parent)?, &[c, b, a]);
    tree.append(other, a)?;
    tree.insert_before(c, a)?;
    assert_eq!(tree.children(other)?, &[]);
    assert_eq!(tree.children(parent)?, &[a, c, b]);
    tree.detach(c)?;
    tree.detach(c)?;
    assert_eq!(tree.children(parent)?, &[a, b]);
    assert_eq!(tree.parent(c)?, None);
    Ok(())
}

#[test]
fn invalid_insertion_leaves_both_trees_unchanged() -> Result<(), TreeError> {
    // Given: an ancestor and descendant, plus a detached insertion anchor.
    let mut tree = Tree::default();
    let root = tree.create_node();
    let child = tree.create_node();
    let detached = tree.create_node();
    tree.append(root, child)?;
    // When/Then: neither a cycle nor an anchor without a parent changes edges.
    assert_eq!(tree.insert_before(child, root), Err(TreeError::Cycle));
    assert_eq!(
        tree.insert_before(detached, child),
        Err(TreeError::DetachedAnchor)
    );
    assert_eq!(tree.children(root)?, &[child]);
    assert_eq!(tree.parent(child)?, Some(root));
    Ok(())
}
