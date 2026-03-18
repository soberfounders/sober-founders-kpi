<?php
/**
 * Plugin Name: Sober SEO REST
 * Description: REST endpoints for Yoast SEO meta writes, 301 redirect management, and site-wide footer injection.
 * Version: 1.5.0
 * Author: Sober Founders Dev
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ── Redirects: perform redirect on front-end requests ────────────────────────
add_action( 'template_redirect', function () {
    $redirects = get_option( 'sober_redirects', [] );
    if ( empty( $redirects ) ) {
        return;
    }

    $request_path = trailingslashit( wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) );

    foreach ( $redirects as $redirect ) {
        $from = trailingslashit( $redirect['from'] );
        if ( strcasecmp( $request_path, $from ) === 0 ) {
            wp_redirect( esc_url_raw( $redirect['to'] ), 301 );
            exit;
        }
    }
} );

// ── Site-wide footer: inject custom HTML once across Astra + Canvas templates
function sober_render_custom_footer_once() {
    static $rendered = false;
    if ( $rendered ) {
        return;
    }

    $footer_html = get_option( 'sober_footer_html', '' );
    if ( ! empty( $footer_html ) ) {
        echo $footer_html; // Already sanitized on write via wp_kses_post.
        $rendered = true;
    }
}

add_action( 'astra_footer_before', 'sober_render_custom_footer_once' );
add_action( 'wp_footer', 'sober_render_custom_footer_once', 5 );

add_action( 'rest_api_init', function () {

    // ── SEO endpoints ────────────────────────────────────────────────────────
    register_rest_route( 'sober/v1', '/seo', [
        'methods'             => 'POST',
        'callback'            => 'sober_seo_update',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'post_id' => [
                'required'          => true,
                'type'              => 'integer',
                'minimum'           => 1,
                'sanitize_callback' => 'absint',
                'validate_callback' => function ( $value ) {
                    return is_numeric( $value ) && (int) $value > 0;
                },
            ],
            'title' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'description' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'focus_keyword' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ],
    ] );

    register_rest_route( 'sober/v1', '/seo/(?P<post_id>\d+)', [
        'methods'             => 'GET',
        'callback'            => 'sober_seo_read',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'post_id' => [
                'required'          => true,
                'type'              => 'integer',
                'minimum'           => 1,
                'sanitize_callback' => 'absint',
                'validate_callback' => function ( $value ) {
                    return is_numeric( $value ) && (int) $value > 0;
                },
            ],
        ],
    ] );

    // ── Footer endpoints ─────────────────────────────────────────────────────
    register_rest_route( 'sober/v1', '/footer', [
        'methods'             => 'GET',
        'callback'            => 'sober_footer_read',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
    ] );

    register_rest_route( 'sober/v1', '/footer', [
        'methods'             => 'POST',
        'callback'            => 'sober_footer_update',
        'permission_callback' => function () {
            return current_user_can( 'manage_options' );
        },
        'args' => [
            'html' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sober_kses_footer',
            ],
        ],
    ] );

    // ── Clear Elementor data (forces WP to render post_content) ─────────────
    register_rest_route( 'sober/v1', '/clear-elementor/(?P<post_id>\d+)', [
        'methods'             => 'POST',
        'callback'            => 'sober_clear_elementor',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'post_id' => [
                'required'          => true,
                'type'              => 'integer',
                'minimum'           => 1,
                'sanitize_callback' => 'absint',
            ],
        ],
    ] );

    // ── Redirect endpoints ───────────────────────────────────────────────────
    register_rest_route( 'sober/v1', '/redirects', [
        'methods'             => 'GET',
        'callback'            => 'sober_redirects_list',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
    ] );

    register_rest_route( 'sober/v1', '/redirects', [
        'methods'             => 'POST',
        'callback'            => 'sober_redirects_add',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'from' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
            'to' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'esc_url_raw',
            ],
        ],
    ] );

    register_rest_route( 'sober/v1', '/redirects', [
        'methods'             => 'DELETE',
        'callback'            => 'sober_redirects_delete',
        'permission_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
        'args' => [
            'from' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ],
        ],
    ] );
} );

// ── Footer sanitizer (wp_kses_post + <style> tags) ──────────────────────────

function sober_kses_footer( $html ) {
    // wp_kses strips <style> content, so extract style blocks first,
    // sanitize the HTML portion, then re-attach styles.
    $styles = '';
    $html_only = preg_replace_callback(
        '/<style[^>]*>(.*?)<\/style>/si',
        function ( $m ) use ( &$styles ) {
            // Strip any tags inside CSS (basic XSS prevention)
            $css = wp_strip_all_tags( $m[1] );
            $styles .= '<style>' . $css . '</style>';
            return '';
        },
        $html
    );
    return $styles . wp_kses_post( $html_only );
}

// ── SEO callbacks ────────────────────────────────────────────────────────────

function sober_seo_update( WP_REST_Request $request ) {
    $post_id       = absint( $request->get_param( 'post_id' ) );
    $title         = sanitize_text_field( $request->get_param( 'title' ) );
    $description   = sanitize_text_field( $request->get_param( 'description' ) );
    $focus_keyword = sanitize_text_field( $request->get_param( 'focus_keyword' ) );

    if ( ! get_post( $post_id ) ) {
        return new WP_Error( 'invalid_post', 'Post not found.', [ 'status' => 404 ] );
    }

    global $wpdb;
    $table = $wpdb->prefix . 'yoast_indexable';

    // Verify Yoast table exists
    $table_check = $wpdb->get_var(
        $wpdb->prepare( 'SHOW TABLES LIKE %s', $table )
    );
    if ( $table_check !== $table ) {
        return new WP_Error( 'dependency_missing', 'Required SEO plugin table not found.', [ 'status' => 500 ] );
    }

    $updates = [];
    $formats = [];

    if ( $title ) {
        $updates['title'] = $title;
        $formats[]        = '%s';
    }
    if ( $description ) {
        $updates['description'] = $description;
        $formats[]              = '%s';
    }
    if ( $focus_keyword ) {
        $updates['primary_focus_keyword'] = $focus_keyword;
        $formats[]                        = '%s';
    }

    if ( empty( $updates ) ) {
        return new WP_Error( 'no_data', 'Provide at least one of: title, description, focus_keyword.', [ 'status' => 400 ] );
    }

    $row_exists = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$table} WHERE object_id = %d AND object_type = 'post' LIMIT 1",
        $post_id
    ) );

    if ( $row_exists ) {
        $result = $wpdb->update(
            $table,
            $updates,
            [ 'object_id' => $post_id, 'object_type' => 'post' ],
            $formats,
            [ '%d', '%s' ]
        );
    } else {
        $result = $wpdb->insert(
            $table,
            array_merge( $updates, [
                'object_id'   => $post_id,
                'object_type' => 'post',
            ] ),
            array_merge( $formats, [ '%d', '%s' ] )
        );
    }

    if ( $result === false ) {
        return new WP_Error( 'db_error', 'Database write failed.', [ 'status' => 500 ] );
    }

    // Also write to post meta so Yoast picks it up on next page load
    if ( $title )         { update_post_meta( $post_id, '_yoast_wpseo_title', $title ); }
    if ( $description )   { update_post_meta( $post_id, '_yoast_wpseo_metadesc', $description ); }
    if ( $focus_keyword ) { update_post_meta( $post_id, '_yoast_wpseo_focuskw', $focus_keyword ); }

    return [
        'success' => true,
        'post_id' => $post_id,
        'updated' => array_keys( $updates ),
    ];
}

function sober_seo_read( WP_REST_Request $request ) {
    $post_id = absint( $request['post_id'] );

    if ( ! get_post( $post_id ) ) {
        return new WP_Error( 'invalid_post', 'Post not found.', [ 'status' => 404 ] );
    }

    return [
        'post_id'       => $post_id,
        'title'         => get_post_meta( $post_id, '_yoast_wpseo_title', true ),
        'description'   => get_post_meta( $post_id, '_yoast_wpseo_metadesc', true ),
        'focus_keyword' => get_post_meta( $post_id, '_yoast_wpseo_focuskw', true ),
    ];
}

// ── Footer callbacks ────────────────────────────────────────────────────────

function sober_footer_read() {
    return [
        'html' => get_option( 'sober_footer_html', '' ),
    ];
}

function sober_footer_update( WP_REST_Request $request ) {
    $html = $request->get_param( 'html' ); // Already sanitized by wp_kses_post.
    update_option( 'sober_footer_html', $html );
    return [
        'success' => true,
        'length'  => strlen( $html ),
    ];
}

// ── Clear Elementor callback ─────────────────────────────────────────────────

function sober_clear_elementor( WP_REST_Request $request ) {
    $post_id = absint( $request['post_id'] );

    if ( ! get_post( $post_id ) ) {
        return new WP_Error( 'invalid_post', 'Post not found.', [ 'status' => 404 ] );
    }

    $deleted = [];
    $keys = [
        '_elementor_data',
        '_elementor_edit_mode',
        '_elementor_css',
        '_elementor_page_assets',
    ];

    foreach ( $keys as $key ) {
        if ( metadata_exists( 'post', $post_id, $key ) ) {
            delete_post_meta( $post_id, $key );
            $deleted[] = $key;
        }
    }

    // Also clear Elementor's CSS cache file if it exists
    $upload_dir = wp_upload_dir();
    $css_path   = $upload_dir['basedir'] . '/elementor/css/post-' . $post_id . '.css';
    if ( file_exists( $css_path ) ) {
        wp_delete_file( $css_path );
        $deleted[] = 'css_file';
    }

    return [
        'success' => true,
        'post_id' => $post_id,
        'cleared' => $deleted,
    ];
}

// ── Redirect callbacks ───────────────────────────────────────────────────────

function sober_redirects_list() {
    return get_option( 'sober_redirects', [] );
}

function sober_redirects_add( WP_REST_Request $request ) {
    $from = sanitize_text_field( $request->get_param( 'from' ) );
    $to   = esc_url_raw( $request->get_param( 'to' ) );

    // Normalize: ensure path starts with / and has trailing slash
    if ( strpos( $from, '/' ) !== 0 ) {
        // Extract path from full URL
        $parsed = wp_parse_url( $from );
        $from   = isset( $parsed['path'] ) ? $parsed['path'] : '/' . $from;
    }
    $from = trailingslashit( $from );

    $redirects = get_option( 'sober_redirects', [] );

    // Check for duplicate
    foreach ( $redirects as $key => $r ) {
        if ( trailingslashit( $r['from'] ) === $from ) {
            // Update existing
            $redirects[ $key ]['to'] = $to;
            update_option( 'sober_redirects', $redirects );
            return [
                'success' => true,
                'action'  => 'updated',
                'from'    => $from,
                'to'      => $to,
            ];
        }
    }

    $redirects[] = [ 'from' => $from, 'to' => $to ];
    update_option( 'sober_redirects', $redirects );

    return [
        'success' => true,
        'action'  => 'created',
        'from'    => $from,
        'to'      => $to,
    ];
}

function sober_redirects_delete( WP_REST_Request $request ) {
    $from = sanitize_text_field( $request->get_param( 'from' ) );
    if ( strpos( $from, '/' ) !== 0 ) {
        $parsed = wp_parse_url( $from );
        $from   = isset( $parsed['path'] ) ? $parsed['path'] : '/' . $from;
    }
    $from = trailingslashit( $from );

    $redirects = get_option( 'sober_redirects', [] );
    $filtered  = array_values( array_filter( $redirects, function ( $r ) use ( $from ) {
        return trailingslashit( $r['from'] ) !== $from;
    } ) );

    if ( count( $filtered ) === count( $redirects ) ) {
        return new WP_Error( 'not_found', 'Redirect not found.', [ 'status' => 404 ] );
    }

    update_option( 'sober_redirects', $filtered );

    return [ 'success' => true, 'action' => 'deleted', 'from' => $from ];
}
