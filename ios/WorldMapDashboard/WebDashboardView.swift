//
//  WebDashboardView.swift
//  WorldMapDashboard
//
//  Created by Stacey A on 3/13/26.
//
import SwiftUI
import WebKit

struct WebDashboardView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool

    class Coordinator: NSObject, WKNavigationDelegate {
        weak var webView: WKWebView?
        var didInitialLoad = false
        let parent: WebDashboardView
        init(parent: WebDashboardView) { self.parent = parent }

        @objc func onRefresh(_ sender: UIRefreshControl) {
            webView?.reload()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation _: WKNavigation!) {
            DispatchQueue.main.async { self.parent.isLoading = true }
        }
        func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
            DispatchQueue.main.async { self.parent.isLoading = false }
            webView.scrollView.refreshControl?.endRefreshing()
        }
        func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async { self.parent.isLoading = false }
            webView.scrollView.refreshControl?.endRefreshing()
            print("Web load failed:", error.localizedDescription)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.preferences.javaScriptEnabled = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.bounces = true

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.onRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.didInitialLoad == false else { return }
        context.coordinator.didInitialLoad = true
        isLoading = true
        let req = URLRequest(url: url,
                             cachePolicy: .reloadIgnoringLocalCacheData,
                             timeoutInterval: 15)
        webView.load(req)
    }
}
