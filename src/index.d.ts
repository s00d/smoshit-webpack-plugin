import { Plugin } from 'webpack';

export default SmoshItWebpackPlugin;

declare class SmoshItWebpackPlugin extends Plugin {
    constructor(options: SmoshItWebpackPlugin.Options);
}

declare namespace SmoshItWebpackPlugin {
    type TestOption = RegExp | string | ((file: string) => boolean);

    // Generic options for plugins missing typings
    interface ExternalOptions {
        [key: string]: any;
    }

    interface Options {
        test?: TestOption | TestOption[];
        minFileSize?: number;
        maxFileSize?: number;
        cacheFolder?: string;
        onlyUseIfSmaller?: boolean;
        disable?: boolean;
        timeout?: number;
        context: string;
        destination?: string | (() => string);
        sources: string[] | (() => string[]);
    }
}
