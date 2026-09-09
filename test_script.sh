#!/bin/bash
# Check if InterventionEngine is used in HoverProvider or CodeActionProvider
grep -ri "InterventionEngine" src/
echo "---"
grep -ri "determineInterventionLevel" src/
