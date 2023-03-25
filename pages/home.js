"use strict";

class Home {
    constructor() {
        this.information = null;
        this.render();
        this.get_information();
    }

    destructor(forced) {
        return true;
    }

    async get_information() {
        if (!app.badge.is_connected()) {
            console.log("Badge not connected");
            this.information = null;
            return;
        }

        this.information = {
            fs: null
        };

        this.information.fs = await app.badge.filesystem_state();

        if (app.page === this) {
            this.render();
        }
    }

    render() {
        let content = {
            header: {
                title: "Information",
                breadcrumbs: [
                    {
                        label: "Information"
                    }
                ]
            },
            content: [[]]
        };

        if (app.badge.is_connected()) {
            content.content[0].push({
                width: 12,
                content: {
                    type: "callout",
                    content: {
                        color: "success",
                        content: [
                            {
                                type: "paragraph",
                                content: "Connected to " + app.badge.getManufacturerName() + " " + app.badge.getProductName() + " " + app.badge.getSerialNumber()
                            }
                        ]
                    }
                }
            });

            if (typeof this.information === "object" && this.information !== null) {
                if (this.information.fs !== null) {
                    let internal_total = Number(this.information.fs.internal.size);
                    let internal_used = internal_total - Number(this.information.fs.internal.free);
                    let internal_percentage = Math.round(internal_used * 100 / internal_total);
                    internal_total = Math.round(internal_total / 100000) / 10;
                    internal_used = Math.round(internal_used / 100000) / 10;

                    let sd_total = Number(this.information.fs.sd.size);
                    let sd_used = sd_total - Number(this.information.fs.sd.free);
                    let sd_percentage = Math.round(sd_used * 100 / sd_total);
                    sd_total = Math.round(sd_total / 100000) / 10;
                    sd_used = Math.round(sd_used / 100000) / 10;

                    let app_total = Number(this.information.fs.app.size);
                    let app_used = app_total - Number(this.information.fs.app.free);
                    let app_percentage = Math.round(app_used * 100 / app_total);
                    app_total = Math.round(app_total / 100000) / 10;
                    app_used = Math.round(app_used / 100000) / 10;

                    content.content[0][0].content.content.content.push({
                        type: "paragraph",
                        content: "Internal filesystem: " + internal_used + " MB of " + internal_total + " MB used (" + internal_percentage + "%)"
                    });

                    content.content[0][0].content.content.content.push({
                        type: "paragraph",
                        content: "SD card filesystem: " + sd_used + " MB of " + sd_total + " MB used (" + sd_percentage + "%)"
                    });

                    content.content[0][0].content.content.content.push({
                        type: "paragraph",
                        content: "App filesystem: " + app_used + " MB of " + app_total + " MB used (" + app_percentage + "%)"
                    });
                }
            }
        } else {
            content.content[0].push({
                width: 12,
                content: {
                    type: "callout",
                    content: {
                        color: "warning",
                        content: [
                            {
                                type: "paragraph",
                                content: "Not connected, please connect to a badge."
                            },
                            {
                                type: "button",
                                color: "primary",
                                label: "Connect to badge",
                                target: "app.badge_connect();"
                            }
                        ]
                    }
                }
            });
        }

        app.renderer.render_content(content);
    }

    on_badge_connected() {
        this.get_information();
        this.render();
    }

    on_badge_disconnected() {
        this.get_information();
        this.render();
    }
}
