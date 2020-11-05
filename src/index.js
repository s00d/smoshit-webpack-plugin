import path from 'path'
import { cpus } from 'os'
import map from 'lodash.map'
import RawSource from 'webpack-sources/lib/RawSource'
import createThrottle from 'async-throttle'
const smosh = require('smosh')

import {
    buildTestFunction,
    invokeIfFunction,
    getFromCacheIfPossible,
    readFile,
    writeFile,
    templatedFilePath
} from './helpers.js'

export default class ImageminPlugin {
    constructor (options = {}) {
        const {
            test = /.*/,
            minFileSize = 0,
            maxFileSize = Infinity,
            cacheFolder = null,
            disable = false,
            onlyUseIfSmaller = false,
            timeout = 100000,
            externalImages = {},
        } = options
        this.maxConcurrency = cpus().length;
        this.options = {
            testFunction: buildTestFunction(test, minFileSize, maxFileSize),
            cacheFolder,
            onlyUseIfSmaller,
            timeout,
            disable,
            externalImages: {
                context: '.',
                sources: [],
                destination: '.',
                fileName: null,
                ...externalImages
            },
        }
    }

    apply (compiler) {
        if (this.options.disable === true) return null;

        this.logger = compiler.getInfrastructureLogger(this.constructor.name);
        this.compilerOptions = compiler.options
        // Access the assets once they have been assembled
        const onEmit = async (compilation, callback) => {
            this.logger = compilation.getLogger(this.constructor.name);

            // Create a throttle object which will limit the number of concurrent processes running
            const throttle = createThrottle(this.maxConcurrency)

            try {
                // Optimise all images at the same time (throttled to maxConcurrency)
                // and await until all of them to complete
                // await Promise.all([
                //     ...this.optimizeWebpackImages(throttle, compilation),
                //     // ...this.optimizeExternalImages(throttle)
                // ])
                await this.optimizeWebpackImages(throttle, compilation);
                // At this point everything is done, so call the callback without anything in it
                callback()
            } catch (err) {
                console.log(err);
                // if at any point we hit a snag, pass the error on to webpack
                callback(err)
            }
        }

        // Check if the webpack 4 plugin API is available
        if (compiler.hooks) {
            // Register emit event listener for webpack 4
            compiler.hooks.emit.tapAsync(this.constructor.name, onEmit)
        } else {
            // Register emit event listener for older webpack versions
            compiler.plugin('emit', onEmit)
        }
    }

    /**
     * Optimize images from webpack and put them back in the asset array when done
     * @param  {Function} throttle       The setup throttle library
     * @param  {Object} compilation      The compilation from webpack-sources
     * @return {Promise[]}               An array of promises that resolve when each image is done being optimized
     */
    async optimizeWebpackImages (throttle, compilation) {
        const {
            testFunction,
            cacheFolder
        } = this.options

        for (let filename in compilation.assets) {
            const asset = compilation.assets[filename]
            const assetSource = asset.source()

            if (testFunction(filename, assetSource)) {
                // Use the helper function to get the file from cache if possible, or
                // run the optimize function and store it in the cache when done
                let optimizedImageBuffer = await getFromCacheIfPossible(cacheFolder, assetSource, async () => {
                    return await this.compressor(assetSource, filename);
                })

                // Then write the optimized version back to the asset object as a "raw source"
                compilation.assets[filename] = new RawSource(optimizedImageBuffer)
            }
        }
    }

    /**
     * Optimizes external images
     * @param  {Function} throttle The setup throttle library
     * @return {Promise[]}         An array of promises that resolve when each image is done being optimized
     */
    async optimizeExternalImages (throttle) {
        const {
            testFunction,
            cacheFolder,
            externalImages: {
                context,
                sources,
                destination,
                fileName
            },
        } = this.options

        const fullContext = path.resolve(this.compilerOptions.context, context)

        const invokedDestination = path.resolve(invokeIfFunction(destination))

        const list = invokeIfFunction(sources);
        for (let i in list) {
            const filename = list[i]
            let relativeFilePath = path.relative(fullContext, filename)
            const fileData = await readFile(path.resolve(fullContext, relativeFilePath))
            if (testFunction(filename, fileData)) {
                // Use the helper function to get the file from cache if possible, or
                // run the optimize function and store it in the cache when done
                let optimizedImageBuffer = await getFromCacheIfPossible(cacheFolder, fileData, async () => {
                    const result = await this.compressor(fileData, filename);
                    return result
                })

                if (fileName) {
                    relativeFilePath = templatedFilePath(fileName, relativeFilePath)
                }

                const writeFilePath = path.join(invokedDestination, relativeFilePath)

                // Write the file to the destination when done
                return writeFile(writeFilePath, optimizedImageBuffer)
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
            timeout,
        } = this.options

        const imageBuffer = (Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData, 'utf8'))
        const originalSize = imageBuffer.length
        return new Promise((resolve, reject) => {
            try {
                smosh({contents: imageBuffer, path: filename})
                    .on('end', (optimizedImageBuffer, info) => {
                        this.debug(optimizedImageBuffer, info);
                        if (onlyUseIfSmaller && optimizedImageBuffer.contents.length > originalSize) {
                            return resolve(imageBuffer);
                        }

                        return resolve(optimizedImageBuffer.contents);
                    })
                    .on('error', (err, file) => {
                        this.logger.log(err);
                        return resolve(imageBuffer)
                    })

                setTimeout(() => {
                    resolve(imageBuffer)
                }, timeout)
            } catch (e) {
                resolve(imageBuffer)
            }
        });
    }
}
