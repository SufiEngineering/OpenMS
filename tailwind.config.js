    /** @type {import('tailwindcss').Config} */
    module.exports = {
      
      content: [
        "./**/*.{html,js}",
        "!./node_modules/**/*", // Exclude node_modules directory
      ],
      theme: {
        extend: {},
      },
      plugins: [
        require('flowbite/plugin')({
            datatables: true,
        }),
      ]
    }
