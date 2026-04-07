"""Helpers for applying persisted revision operations to annotation documents."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def apply_operation_to_document(document: dict[str, Any], operation: dict[str, Any]) -> dict[str, Any]:
    """Apply a single revision operation to a persisted annotation document."""
    if not isinstance(document, dict):
        raise ValueError("Cannot apply revisions without an existing annotation document")

    next_document = deepcopy(document)
    elements = next_document.get("elements")
    if not isinstance(elements, list):
        raise ValueError("Annotation document has an invalid elements list")

    kind = operation.get("kind")
    element_id = str(operation.get("elementId") or "")

    if kind == "create":
        element = operation.get("element")
        if not isinstance(element, dict):
            raise ValueError("Create operation is missing an element payload")
        elements.append(deepcopy(element))
        return next_document

    if not element_id:
        raise ValueError("Revision operation is missing elementId")

    if kind == "delete":
        next_document["elements"] = [
            element
            for element in elements
            if not (isinstance(element, dict) and str(element.get("id") or "") == element_id)
        ]
        return next_document

    if kind == "update":
        after = operation.get("after")
        if not isinstance(after, dict):
            raise ValueError(f"Update operation for {element_id} is missing an 'after' payload")
        for index, element in enumerate(elements):
            if isinstance(element, dict) and str(element.get("id") or "") == element_id:
                elements[index] = deepcopy(after)
                return next_document
        raise ValueError(f"Cannot update missing element: {element_id}")

    raise ValueError(f"Unsupported revision operation kind: {kind}")


def apply_revision_events_to_document(
    document: dict[str, Any],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    """Apply a batch of revision events to a persisted annotation document."""
    next_document = deepcopy(document)

    for event in events:
        operations = event.get("operations")
        if not isinstance(operations, list):
            raise ValueError("Revision event is missing a valid operations list")
        for operation in operations:
            if not isinstance(operation, dict):
                raise ValueError("Revision event contains an invalid operation payload")
            next_document = apply_operation_to_document(next_document, operation)

    return next_document
