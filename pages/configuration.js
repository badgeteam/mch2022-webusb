"use strict";

class Configuration {
    constructor() {
        this.render();
    }

    destructor(forced) {
        return true;
    }

    render() {
        let content = {
            header: {
                title: "Configuration",
                breadcrumbs: [
                    {
                        label: "Configuration"
                    }
                ]
            },
            content: [
                [
                    {
                        width: 12,
                        content: [
                            {
                                type: "card",
                                content: {
                                    color: "white",
                                    padding: "0",
                                    header: {
                                        color: "primary",
                                        content: [
                                            {
                                                type: "title",
                                                card: true,
                                                icon: "cog",
                                                content: "Configuration"
                                            }
                                        ],
                                        tools: [
                                            {
                                                type: "link",
                                                icon: "plus",
                                                target: "#",
                                                button: ["tool", "sm"],
                                                color: "primary"
                                            }
                                        ]
                                    },
                                    content: "Not yet implemented"
                                }
                            }
                        ]
                    }
                ]
            ]
        };

        app.renderer.render_content(content);
    }
}
