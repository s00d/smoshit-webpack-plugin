'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _os = require('os');

var _lodash = require('lodash.map');

var _lodash2 = _interopRequireDefault(_lodash);

var _RawSource = require('webpack-sources/lib/RawSource');

var _RawSource2 = _interopRequireDefault(_RawSource);

var _asyncThrottle = require('async-throttle');

var _asyncThrottle2 = _interopRequireDefault(_asyncThrottle);

var _helpers = require('./helpers.js');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const smosh = require('smosh');

class ImageminPlugin {
    constructor(options = {}) {
        const {
            test = /.*/,
            minFileSize = 0,
            maxFileSize = Infinity,
            cacheFolder = null,
            disable = false,
            onlyUseIfSmaller = false,
            timeout = 100000,
            externalImages = {}
        } = options;
        this.maxConcurrency = (0, _os.cpus)().length;
        this.options = {
            testFunction: (0, _helpers.buildTestFunction)(test, minFileSize, maxFileSize),
            cacheFolder,
            onlyUseIfSmaller,
            timeout,
            disable,
            externalImages: (0, _extends3.default)({
                context: '.',
                sources: [],
                destination: '.',
                fileName: null
            }, externalImages)
        };
    }

    apply(compiler) {
        if (this.options.disable === true) return null;

        this.logger = compiler.getInfrastructureLogger(this.constructor.name);
        this.compilerOptions = compiler.options;
        // Access the assets once they have been assembled
        const onEmit = async (compilation, callback) => {
            this.logger = compilation.getLogger(this.constructor.name);

            // Create a throttle object which will limit the number of concurrent processes running
            const throttle = (0, _asyncThrottle2.default)(this.maxConcurrency);

            try {
                // Optimise all images at the same time (throttled to maxConcurrency)
                // and await until all of them to complete
                // await Promise.all([
                //     ...this.optimizeWebpackImages(throttle, compilation),
                //     // ...this.optimizeExternalImages(throttle)
                // ])
                await this.optimizeWebpackImages(throttle, compilation);
                // At this point everything is done, so call the callback without anything in it
                callback();
            } catch (err) {
                console.log(err);
                // if at any point we hit a snag, pass the error on to webpack
                callback(err);
            }
        };

        // Check if the webpack 4 plugin API is available
        if (compiler.hooks) {
            // Register emit event listener for webpack 4
            compiler.hooks.emit.tapAsync(this.constructor.name, onEmit);
        } else {
            // Register emit event listener for older webpack versions
            compiler.plugin('emit', onEmit);
        }
    }

    /**
     * Optimize images from webpack and put them back in the asset array when done
     * @param  {Function} throttle       The setup throttle library
     * @param  {Object} compilation      The compilation from webpack-sources
     * @return {Promise[]}               An array of promises that resolve when each image is done being optimized
     */
    async optimizeWebpackImages(throttle, compilation) {
        const {
            testFunction,
            cacheFolder
        } = this.options;

        for (let filename in compilation.assets) {
            const asset = compilation.assets[filename];
            const assetSource = asset.source();

            if (testFunction(filename, assetSource)) {
                // Use the helper function to get the file from cache if possible, or
                // run the optimize function and store it in the cache when done
                let optimizedImageBuffer = await (0, _helpers.getFromCacheIfPossible)(cacheFolder, assetSource, async () => {
                    return await this.compressor(assetSource, filename);
                });

                // Then write the optimized version back to the asset object as a "raw source"
                compilation.assets[filename] = new _RawSource2.default(optimizedImageBuffer);
            }
        }
    }

    /**
     * Optimizes external images
     * @param  {Function} throttle The setup throttle library
     * @return {Promise[]}         An array of promises that resolve when each image is done being optimized
     */
    async optimizeExternalImages(throttle) {
        const {
            testFunction,
            cacheFolder,
            externalImages: {
                context,
                sources,
                destination,
                fileName
            }
        } = this.options;

        const fullContext = _path2.default.resolve(this.compilerOptions.context, context);

        const invokedDestination = _path2.default.resolve((0, _helpers.invokeIfFunction)(destination));

        const list = (0, _helpers.invokeIfFunction)(sources);
        for (let i in list) {
            const filename = list[i];
            let relativeFilePath = _path2.default.relative(fullContext, filename);
            const fileData = await (0, _helpers.readFile)(_path2.default.resolve(fullContext, relativeFilePath));
            if (testFunction(filename, fileData)) {
                // Use the helper function to get the file from cache if possible, or
                // run the optimize function and store it in the cache when done
                let optimizedImageBuffer = await (0, _helpers.getFromCacheIfPossible)(cacheFolder, fileData, async () => {
                    const result = await this.compressor(fileData, filename);
                    console.log('result', result);
                    return result;
                });

                if (fileName) {
                    relativeFilePath = (0, _helpers.templatedFilePath)(fileName, relativeFilePath);
                }

                const writeFilePath = _path2.default.join(invokedDestination, relativeFilePath);

                // Write the file to the destination when done
                return (0, _helpers.writeFile)(writeFilePath, optimizedImageBuffer);
            }
        }
    }

    debug(file, data) {
        if (file.path) {
            this.logger.log(file.path);
        }

        if (data) {
            this.logger.log('webpack-smushit:', 'Compress rate', '%', data.percent);
            this.logger.log('webpack-smushit:', data.src_size, 'bytes  to  ', data.dest_size, 'bytes');
        }
    }

    compressor(imageData, filename) {
        const {
            onlyUseIfSmaller,
            timeout
        } = this.options;

        const imageBuffer = Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData, 'utf8');
        const originalSize = imageBuffer.length;
        return new _promise2.default((resolve, reject) => {
            try {
                smosh({ contents: imageBuffer, path: filename }).on('end', (optimizedImageBuffer, info) => {
                    this.debug(optimizedImageBuffer, info);
                    if (onlyUseIfSmaller && optimizedImageBuffer.contents.length > originalSize) {
                        return resolve(imageBuffer);
                    }

                    return resolve(optimizedImageBuffer.contents);
                }).on('error', (err, file) => {
                    this.logger.log(err);
                    return resolve(imageBuffer);
                });

                setTimeout(() => {
                    resolve(imageBuffer);
                }, timeout);
            } catch (e) {
                resolve(imageBuffer);
            }
        });
    }
}
exports.default = ImageminPlugin;
//# sourceMappingURL=index.js.map