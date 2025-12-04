# Frontend Refactoring

- Reorganize the frontend software such that each line of code is <200 lines
- Utilize CSS files for styling instead of inline styles
- Separate HTML, CSS, and JavaScript into distinct files
- Ensure all functions have clear and descriptive names
- Remove any redundant or unused code
- Implement consistent indentation and formatting throughout the codebase


# Backend Refactoring

- The music.py module has grown too large and must be split into a package
- Have a module for the stat generation of the planets where it runs through each
planet and generates the needed stats like eccentricity, etc... 
- Improve optimizations such that only the neccessary information is sent depending on the request
- For example, a trajectory-only sim should not send back any audio event data