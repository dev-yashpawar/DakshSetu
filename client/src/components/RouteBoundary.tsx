import { Component, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslate } from "../localization";
interface Props {
  children: ReactNode;
  path: string;
  heading: string;
  message: string;
  reload: string;
  home: string;
}
class PageBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.path !== this.props.path)
      this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="container worker-main narrow" role="alert">
        <h1>{this.props.heading}</h1>
        <p>{this.props.message}</p>
        <div className="hero-buttons">
          <button className="button" onClick={() => window.location.reload()}>
            {this.props.reload}
          </button>
          <Link className="button secondary" to="/">
            {this.props.home}
          </Link>
        </div>
      </main>
    );
  }
}
export function RouteBoundary({ children }: { children: ReactNode }) {
  const tr = useTranslate(),
    location = useLocation();
  return (
    <PageBoundary
      path={location.pathname + location.search}
      heading={tr("This page could not load")}
      message={tr(
        "Check your connection and reload the page. Saved device drafts are not cleared.",
      )}
      reload={tr("Reload page")}
      home={tr("Return home")}
    >
      {children}
    </PageBoundary>
  );
}
