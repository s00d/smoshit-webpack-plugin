# SmoshOt plugin for Webpack

[![npm](https://img.shields.io/npm/v/smoshit-webpack-plugin.svg)](https://www.npmjs.com/package/smoshit-webpack-plugin)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

This is a simple plugin that uses [smosh](https://github.com/heldr/smosh) to compress all images in your project.

## Install

`npm install smoshit-webpack-plugin`

Requires node >=4.0.0

## Example Usage

```js
var SmoshItPlugin = require('smoshit-webpack-plugin').default
// Or if using ES2015:
// import SmoshItPlugin from 'smoshit-webpack-plugin'

module.exports = {
  plugins: [
    // Make sure that the plugin is after any plugins that add images
    new SmoshItPlugin({
      disable: process.env.NODE_ENV !== 'production', // Disable during development
    })
  ]
}
```

Working with [copy-webpack-plugin](https://github.com/kevlened/copy-webpack-plugin):

```js
module.exports = {
  plugins: [
    // Copy the images folder and optimize all the images
    new CopyWebpackPlugin([{
      from: 'images/'
    }]),
    new SmoshItPlugin({ test: /\.(jpe?g|png|gif|svg)$/i })
  ]
}
```

*Note the order of the plugins matters. `SmoshItPlugin` must be placed after `CopyWebpackPlugin` (or any other plugins that deal with images) in `plugins` array.*

## API

### new SmoshItPlugin(options)

#### options.disable

**type**: `Boolean`
**default**: `false`

When set to `true` it will disable the plugin entirely. This is useful for disabling the plugin during development, and only enabling it during production

#### options.test

**type**: `RegExp` or `String` or `Array`
**default**: `/.*/`

This plugin will only run on files that match this test. This is similar to the webpack loader `test` option (but is not using the same implementation, so there might be major differences!). This can either be a RegExp object, a [minimatch glob](https://github.com/isaacs/minimatch), a function which gets the filename and returns `true` if the file should be minified, or an array of any of them.

This can allow you to only run the plugin on specific files, or even include the plugin multiple times for different sets of images and apply different imagemin settings to each.

This will overwrite everything, including the `externalImages` option!

Example:

```js
import SmoshItPlugin from 'smoshit-webpack-plugin'

module.exports = {
  plugins: [
    // Use the default settings for everything in /images/*
    new SmoshItPlugin({ test: 'images/**' }),
    // bump up the optimization level for all the files in my `bigpngs` directory
    new SmoshItPlugin({
      test: 'bigpngs/**',
    })
  ]
}
```


#### options.externalImages

**type**: `Object`
**default**: `{ context: '.', sources: [], destination: null, fileName: null }`

Include any external images (those not included in webpack's compilation assets) that you want to be parsed by SmoshIt.
If a destination value is not supplied the files are optimized in place. You can optionally set either of these to a function which will be invoked at the last possible second before optimization to grab files that might not exist at the time of writing the config (see #37 for more info).

The paths will work based on the webpack's (and this plugin's) `context` option, so in the following example, the files will be read from `./src/images/**/*.png` and will be written to `.src/public/images/**/*.png` Context only applies to the `sources` array.

Example:

```js
import SmoshItPlugin from 'smoshit-webpack-plugin'
import glob from 'glob'

module.exports = {
  plugins: [
    new SmoshItPlugin({
      externalImages: {
        context: 'src', // Important! This tells the plugin where to "base" the paths at
        sources: glob.sync('src/images/**/*.png'),
        destination: 'src/public/images',
        fileName: '[path][name].[ext]' // (filePath) => filePath.replace('jpg', 'webp') is also possible
      }
    })
  ]
}
```

#### options.minFileSize

**type**: `Integer`
**default**: `0`

Only apply to images that are **larger** than this value *in bytes*.

#### options.maxFileSize

**type**: `Integer`
**default**: `Infinity`

Only apply to images that are **smaller than or equal-to** this value *in bytes*.

This and `minFileSize` together can be used to include WebpackSmoshItPlugin multiple times with multiple configs on different file sizes.

Example:

```js
import SmoshItPlugin from 'smoshit-webpack-plugin'
import glob from 'glob'

module.exports = {
  plugins: [
    new SmoshItPlugin({
      maxFileSize: 10000, // Only apply this one to files equal to or under 10kb
    }),
    new SmoshItPlugin({
      minFileSize: 10000, // Only apply this one to files over 10kb
    })
  ]
}
```

#### options.cacheFolder

**type**: `String`
**default**: `''`

Cache already minified images into a `cacheFolder`. On next run plugin will
check for the cached images first. If cached image exists it will simply use that one.
Otherwise image will be optimised and written to the `cacheFolder` for later builds.

**Note**: This is a very simple cache implementation, it WILL NOT intelligently clear the
cache if you update the options in this plugin. There also might be significantly more files in the cache than you have images, this is normal, and a side-effect of how I'm deferring to `smoshit` to determine if a file is an image or not. It can be prevented by setting a good `test` regex.

Example:

```js
import resolve from 'path'
import SmoshItPlugin from 'smoshit-webpack-plugin'

module.exports = {
  plugins: [
    new SmoshItPlugin({
      cacheFolder: resolve('./cache'), // use existing folder called cache in the current dir
    })
  ]
}
```

#### options.onlyUseIfSmaller

**type**: `Boolean`
**default**: `false`

If set to `true`, this plugin will use the original image if the optimization process makes it larger.

**`true` used to be the default behavior in version 2 of this plugin!**

## License

[MIT](LICENSE.md) Copyright (c) [Kuzmin Pavel](https://github.com/s00d)



*   Big thanks to [`imagemin-webpack-loader`](https://github.com/Klathmon/imagemin-webpack-plugin) to learn how to write the plugin.
*   Big thanks to [`gulp-smushit`](https://github.com/heldr/gulp-smushit) to learn how to write the plugin.
