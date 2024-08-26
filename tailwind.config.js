    /** @type {import('tailwindcss').Config} */
    module.exports = {
      
      content: [
        "/node_modules/flowbite/**/*.js",
        "./**/*.{html,js}"],
      theme: {
        extend: {},
      },
      plugins: [
        require('flowbite/plugin')({
            datatables: true,
        }),
      ]
    }
