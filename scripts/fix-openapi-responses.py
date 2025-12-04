#!/usr/bin/env python3
"""
Fix OpenAPI responses to use shared SuccessResponse schema.

This script adds the missing 'success' field to all 200 OK responses
by ensuring they all reference the SuccessResponse schema properly.
"""

import re
import sys

def main():
    openapi_file = 'docs/openapi.yaml'

    with open(openapi_file, 'r') as f:
        content = f.read()

    # Pattern 1: Find inline response schemas that have 'data' and 'metadata' but no 'success'
    # We'll add 'success: true' to the required fields and properties

    lines = content.split('\n')
    modified_lines = []
    in_200_response = False
    in_properties = False
    found_data_prop = False
    found_metadata_prop = False
    found_success_prop = False
    indent_level = 0
    properties_indent = 0

    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect '200' response sections
        if "'200':" in line or '"200":' in line:
            in_200_response = True
            found_data_prop = False
            found_metadata_prop = False
            found_success_prop = False
            indent_level = len(line) - len(line.lstrip())

        # Detect 'properties:' within a 200 response
        if in_200_response and 'properties:' in line and 'type: object' in lines[i-1]:
            in_properties = True
            properties_indent = len(line) - len(line.lstrip())

        # Track which properties we've seen
        if in_properties:
            if 'data:' in line and line.strip().startswith('data:'):
                found_data_prop = True
            if 'metadata:' in line and line.strip().startswith('metadata:'):
                found_metadata_prop = True
            if 'success:' in line and line.strip().startswith('success:'):
                found_success_prop = True

        # Detect end of properties section
        if in_properties and 'required:' in line:
            in_properties = False

            # If we have data and metadata but no success, add it
            if found_data_prop and found_metadata_prop and not found_success_prop:
                # Insert success property before data
                success_indent = ' ' * (properties_indent + 2)
                success_lines = [
                    f'{success_indent}success:',
                    f'{success_indent}  type: boolean',
                    f'{success_indent}  description: Success discriminator',
                    f'{success_indent}  enum: [true]',
                    f'{success_indent}  example: true',
                ]

                # Find the line with 'data:' property and insert before it
                for j in range(len(modified_lines) - 1, -1, -1):
                    if modified_lines[j].strip().startswith('data:'):
                        # Insert success property before data
                        for success_line in reversed(success_lines):
                            modified_lines.insert(j, success_line)
                        break

                # Now update the required array to include 'success'
                # The current line should be 'required:'
                # We need to add '- success' to the required list
                if 'required:' in line:
                    modified_lines.append(line)
                    # Look ahead to find the required list
                    i += 1
                    while i < len(lines):
                        next_line = lines[i]
                        modified_lines.append(next_line)

                        # If we hit the first required item, insert success before it
                        if next_line.strip().startswith('- ') and '- success' not in next_line:
                            req_indent = len(next_line) - len(next_line.lstrip())
                            modified_lines.insert(len(modified_lines) - 1, f'{" " * req_indent}- success')
                            break

                        # If we've left the required section, stop
                        if next_line.strip() and not next_line.strip().startswith('-') and 'required:' not in next_line:
                            break
                        i += 1

                    in_200_response = False
                    i += 1
                    continue

        # Reset when we leave the 200 response section
        if in_200_response and line.strip() and not line.startswith(' ' * indent_level) and "'" in line and ':' in line:
            in_200_response = False

        modified_lines.append(line)
        i += 1

    # Write back
    with open(openapi_file, 'w') as f:
        f.write('\n'.join(modified_lines))

    print("✅ Fixed OpenAPI responses to include 'success' field")
    print(f"📝 Modified {openapi_file}")

if __name__ == '__main__':
    main()
